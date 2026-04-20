-- Once — database schema.
-- Runs safely on a fresh Neon/Postgres database or an existing one.

create extension if not exists "pgcrypto";

-- Published stories. Shape mirrors data/stories.json so the JSON remains
-- a usable fallback when the DB is unavailable (dev, preview, outage).
create table if not exists stories (
  id                 text primary key,
  photo_url          text,
  country            text not null,
  region             text,
  city               text not null,
  timezone           text not null,
  local_hour         smallint not null check (local_hour between 0 and 23),

  original_language  text not null,
  original_text      text not null,
  english_text       text not null default '',

  currency_code      text not null,
  currency_symbol    text not null,
  milk_price_local   numeric(14,4) not null,
  eggs_price_local   numeric(14,4) not null,
  milk_price_usd     numeric(10,4) not null,
  eggs_price_usd     numeric(10,4) not null,

  published_at       timestamptz not null default now(),
  selected_hour      bigint,                       -- optional pinned slot
  source_url         text,
  source_name        text,
  lat                numeric(9,5),
  lng                numeric(9,5)
);

-- Migrations for existing databases: add lat/lng if missing.
alter table stories add column if not exists lat numeric(9,5);
alter table stories add column if not exists lng numeric(9,5);

-- Phase 3 (ingest pipeline) additions.
alter table stories add column if not exists weather_current     text;
alter table stories add column if not exists location_summary    text;
alter table stories add column if not exists fetched_at          timestamptz;

create index if not exists stories_published_at_idx on stories (published_at desc);
create index if not exists stories_selected_hour_idx on stories (selected_hour) where selected_hour is not null;

-- Moderation queue. AI-proposed candidates or manually-ingested items
-- land here with status='pending' and wait for a human to review.
create table if not exists moderation_queue (
  id                     uuid primary key default gen_random_uuid(),
  status                 text not null default 'pending'
                           check (status in ('pending','approved','rejected')),
  created_at             timestamptz not null default now(),
  reviewed_at            timestamptz,
  reviewer               text,

  -- Source / provenance
  source_url             text,
  source_input           text not null,           -- raw text pasted or scraped
  source_hint_city       text,                    -- optional editor hint

  -- What the AI produced (editor can override before approving)
  ai_model               text,
  ai_rationale           text,
  ai_passed_filter       boolean,                 -- did AI think it was "ordinary"?

  photo_url              text,
  country                text,
  region                 text,
  city                   text,
  timezone               text,
  local_hour             smallint,

  original_language      text,
  original_text          text,
  english_text           text default '',

  currency_code          text,
  currency_symbol        text,
  milk_price_local       numeric(14,4),
  eggs_price_local       numeric(14,4),
  milk_price_usd         numeric(10,4),
  eggs_price_usd         numeric(10,4),

  rejected_reason        text,
  published_as_id        text references stories(id) on delete set null,
  lat                    numeric(9,5),
  lng                    numeric(9,5)
);

alter table moderation_queue add column if not exists lat numeric(9,5);
alter table moderation_queue add column if not exists lng numeric(9,5);

alter table moderation_queue add column if not exists weather_current  text;
alter table moderation_queue add column if not exists location_summary text;
alter table moderation_queue add column if not exists fetched_at       timestamptz;
alter table moderation_queue add column if not exists score_specificity smallint;
alter table moderation_queue add column if not exists score_resonance   smallint;
alter table moderation_queue add column if not exists score_register    smallint;

-- rank within a single ingest cycle (1 = winner, 2 = runner-up, ...).
-- Lets the review UI group by city and order inside each group.
alter table moderation_queue add column if not exists rank              smallint default 1;
-- city_id for grouping in /admin/review (mirrors the cities row).
alter table moderation_queue add column if not exists city_id           text;

create index if not exists queue_status_created_idx
  on moderation_queue (status, created_at desc);
create index if not exists queue_pending_city_rank_idx
  on moderation_queue (city_id, rank, created_at desc)
  where status = 'pending';

-- Dedup: every candidate URL we've processed in the last 30 days.
-- Pipeline consults this before running prefilter on a fresh entry.
-- Content-hash dedups the rare case of the same piece re-posted at a
-- different URL (e.g. AMP, syndication).
create table if not exists seen_urls (
  url_hash       text primary key,             -- sha256(source_url)
  content_hash   text,                         -- sha256(title + snippet[:200])
  source_host    text,
  first_seen_at  timestamptz not null default now()
);

create index if not exists seen_urls_content_idx on seen_urls (content_hash)
  where content_hash is not null;
create index if not exists seen_urls_first_seen_idx on seen_urls (first_seen_at);

-- Budget ledger. One row per AI call. Used both for an audit trail and
-- for the hard weekly cutoff: sum(cost_usd) in the last 7 days must stay
-- below AI_BUDGET_USD_PER_WEEK, or ingest is refused.
create table if not exists budget_ledger (
  id                 bigserial primary key,
  at                 timestamptz not null default now(),
  model              text not null,
  operation          text not null,              -- 'curate' | 'retry' | ...
  prompt_tokens      integer not null default 0,
  cached_tokens      integer not null default 0, -- subset of prompt_tokens
  completion_tokens  integer not null default 0,
  cost_usd           numeric(10,6) not null default 0,
  queue_id           uuid references moderation_queue(id) on delete set null
);

create index if not exists budget_ledger_at_idx on budget_ledger (at desc);

-- Cities. The pipeline picks one of these each run and fetches their
-- configured RSS feeds. Seeded from scripts/seed-cities.mjs and can be
-- curated manually afterwards.
create table if not exists cities (
  id               text primary key,                -- "tokyo", "sarajevo"
  name             text not null,                   -- display name
  country          text not null,
  region           text,
  timezone         text not null,
  lat              numeric(9,5) not null,
  lng              numeric(9,5) not null,
  currency_code    text,
  currency_symbol  text,
  original_language text,                            -- ISO 639-1
  location_summary text,                             -- "a district in northern China, ~1M people"
  rss_feeds        text[] not null default '{}',    -- URLs
  is_active        boolean not null default true,
  last_ingest_at   timestamptz,                      -- updated by pipeline
  created_at       timestamptz not null default now()
);

create index if not exists cities_active_idx on cities (is_active) where is_active;

-- City-level enrichment cache. Prices are expensive/noisy to recompute
-- per-story, so we estimate them once per city and reuse until
-- prices_updated_at ages out. Currency / language / location_summary
-- already live on cities; this extends that pattern.
alter table cities add column if not exists milk_price_local numeric(14,4);
alter table cities add column if not exists eggs_price_local numeric(14,4);
alter table cities add column if not exists milk_price_usd   numeric(10,4);
alter table cities add column if not exists eggs_price_usd   numeric(10,4);
alter table cities add column if not exists prices_updated_at timestamptz;
-- Free-text aliases used by the city resolver: e.g. a row for "tokyo"
-- might also match "Tōkyō", "東京", "Tokyo Metropolis". Plain text[] —
-- resolver does case-insensitive lookup.
alter table cities add column if not exists aliases text[] not null default '{}';

-- Audit log of every AI decision the ingest pipeline makes.
-- One row per candidate the pipeline evaluated, whether it made it into
-- the queue or not. Used for debugging and (later) as few-shot examples
-- from historical editor approvals.
create table if not exists ai_decisions (
  id                bigserial primary key,
  at                timestamptz not null default now(),
  city_id           text references cities(id) on delete set null,
  source_url        text,
  source_title      text,
  source_snippet    text,
  stage             text not null,                   -- 'prefilter' | 'score' | 'rewrite'
  verdict           text,                            -- 'pass' | 'fail' | 'selected'
  score_specificity smallint,
  score_resonance   smallint,
  score_register    smallint,
  rationale         text,
  queue_id          uuid references moderation_queue(id) on delete set null
);

create index if not exists ai_decisions_at_idx on ai_decisions (at desc);
create index if not exists ai_decisions_city_idx on ai_decisions (city_id, at desc);

-- English translation of source_title for the runs dashboard (scannable
-- at a glance regardless of feed language). Populated during prefilter.
alter table ai_decisions add column if not exists source_title_en text;

-- One row per ingest run (manual or cron). Pipeline writes 'running' on
-- start, then updates to 'completed' or 'failed' when done. The runs
-- dashboard shows 'running' rows live and groups 'completed' ones below.
create table if not exists pipeline_runs (
  id             uuid primary key default gen_random_uuid(),
  city_id        text references cities(id) on delete set null,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text not null default 'running'
                   check (status in ('running','completed','failed')),
  stage          text,                     -- "prefilter" | "score" | "rewrite" (latest activity)
  considered     integer not null default 0,
  prefilter_pass integer not null default 0,
  result_summary text,
  queue_id       uuid references moderation_queue(id) on delete set null,
  error          text
);

create index if not exists pipeline_runs_started_idx on pipeline_runs(started_at desc);
create index if not exists pipeline_runs_running_idx on pipeline_runs(status)
  where status = 'running';
