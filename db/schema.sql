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
  source_name        text
);

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
  published_as_id        text references stories(id) on delete set null
);

create index if not exists queue_status_created_idx
  on moderation_queue (status, created_at desc);

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
