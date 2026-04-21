import OpenAI from "openai";
import { createHash } from "node:crypto";
import { requireSql } from "./db";
import { pickCity, markCityIngested, fetchCityEntries, type FeedEntry } from "./sources";
import {
  assertBudget,
  estimateCost,
  recordSpend,
  type UsageBreakdown
} from "./budget";
import { fetchWeatherLabel } from "./weather";
import { resolveHeroImage } from "./ogImage";
import type { City } from "./types";
import { ONCE_HEADER, SECURITY_NOTE } from "./prompts";

// Prefilter uses a lean security note — we DON'T want the full
// photograph-test / amplifier rules injected here, or the model
// treats them as gate criteria. Only the full-score stage does.
const SECURITY_NOTE_PREFILTER = SECURITY_NOTE;

/**
 * The ingest pipeline.
 *
 * runIngest({cityId?}) — one city:
 *   1. Pick a city (or use the one specified).
 *   2. Fetch its RSS feeds, get up to ~40 normalised entries.
 *   3. Dedup against seen_urls (30-day window, URL + content hash).
 *   4. Prefilter (cheap): yes/no per entry from title + snippet.
 *   5. Full score on top-N survivors (specificity / resonance / register).
 *   6. Write the TOP_PER_CITY best into moderation_queue with rank 1..N.
 *
 * runBatchIngest() — all active cities in sequence. Used by the daily
 * cron at 3:30am. Returns per-city summaries.
 */

const PREFILTER_MODEL = process.env.INGEST_PREFILTER_MODEL || "gpt-4o-mini";
const FULL_MODEL = process.env.INGEST_FULL_MODEL || "gpt-4o-mini";

// Threshold: any story with all three scores >= this is flagged as
// ai_passed_filter=true. If nothing reaches it, the top-scored entries
// are saved anyway — "always have something to review."
const SCORE_THRESHOLD = 7;

// Up to N entries go through the expensive full pass per city per run.
const TOP_N_FOR_FULL_PASS = 8;

// How many candidates per city get queued for human review. Set to 5
// during bootstrap so the editor can learn each source's register fast.
const TOP_PER_CITY = 5;

// --- OpenAI client ---------------------------------------------------
let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set.");
  _client = new OpenAI({ apiKey: key });
  return _client;
}

// --- prompts ---------------------------------------------------------
// Principle + rules + contrast pairs all live in lib/prompts.ts as
// ONCE_HEADER. Both stages below append their stage-specific output
// contract on top of that shared base.

const PREFILTER_SYSTEM = `Once is a quiet web app that shows one small moment from somewhere
in the world, once per hour. You are screening RSS titles for the
pipeline. A deeper pass with full body text runs downstream, so your
job is ROUGH and GENEROUS, not final.

${SECURITY_NOTE_PREFILTER}

**ERR HEAVILY TOWARD PASS.** False positives are cheap — the scoring
stage catches them. False negatives are expensive — we never see them
again. When unsure, PASS.

IMPORTANT — do NOT apply the Once writing rules (photograph test,
no amplifiers, proper-noun care) at this stage. Those rules govern
what we PUBLISH, not what we CONSIDER. A promotional-looking title
can become a Once moment after scoring; a seasonal-flower headline
can become one too; a statue feature can become one. Let the scorer
decide.

REJECT only when the title clearly signals one of:
  • National politics / elections / policy / diplomacy
  • Markets (stocks, crypto), macroeconomics, corporate earnings
  • Major-celebrity gossip (royals, pop stars, reality TV)
  • Lists / opinion / advocacy ("5 best…", "why we need…")
  • Tech-industry trend pieces ("AI is reshaping…")
  • Catastrophe coverage focused on casualty counts / damage scale
    (a single-person incident, a bounded human scene during a weather
    event, or a local-organised response to one PASSES).

Examples that SHOULD PASS at prefilter (even if the register looks off):
  • "Sanrio character defies physics in sumo collaboration" — specific, uncanny.
  • "Japanese afternoon tea in a manor house outside Tokyo is something special" —
    a specific place, specific ritual. Scorer will judge register.
  • "New Totoro carabiner pouches" — SoraNews24-shaped curiosity; pass.
  • "5.3 million Nemophila flowers in full bloom at Hitachi" — specific
    place, specific number, specific moment; the scorer might still
    reject for pastoral vagueness, but that's the scorer's job, not yours.
  • "The 11-Headed Kannon at Kōgenji in Shiga" — one named object in one
    named place; pass.
  • "Heavy rain floods Tianjin; one resident rows an inflatable boat" —
    obvious pass.
  • "61-year-old fisherman falls off boat, swims to safety" — obvious pass.

Examples that should REJECT at prefilter:
  • "McDonald's adds Hello Kitty drinks to menu" — pure promo.
  • "Looking for a church near Shinjuku" — user question.
  • "5 best ramen shops in Tokyo" — listicle.
  • "Bitcoin hits $90k" — markets.
  • "PM announces new tax policy" — national politics.

Also return a faithful English rendering of the title (a translation,
not a paraphrase). If the title is already English, copy it.

Return JSON: { "pass": true|false, "why": "<under 15 words>", "title_en": "<english title>" }`;

const FULL_SYSTEM = `${ONCE_HEADER}

YOUR JOB: evaluate one candidate entry. Score the UNDERLYING MOMENT's
potential to become a Once story, then — if it has potential — write
the Once rewrite.

CRITICAL — score the MOMENT, not the source prose.

The source is often written in newspaper voice with amplifier words
("defies odds", "incredibly", "stunning", "must-see"). THAT IS FINE.
Your rewrite will strip those. Judge whether there's a real, specific,
bounded, memorable human moment underneath. If yes, score generously
and rewrite; if not, score low.

BE GENEROUS — aim for the middle of the scale, not the low end. A
title with 2+ concrete nouns + a bounded event deserves 6+ on
specificity even if the snippet is thin. Trust that the body (or a
restrained rewrite) can carry detail you can't see here.

- specificity (1-10): does the underlying moment have named anchors?
    1  = pure abstraction ("spring has come")
    4  = some detail but generic ("a local shop closed early")
    6  = ONE concrete anchor (named place OR named subject) + a verb.
    8  = multiple named anchors (place + time + actor + object)
    10 = photographable scene, sensory detail

- resonance (1-10): would a reader describe this at dinner?
    1  = forgotten in 5 minutes
    4  = mildly interesting
    6  = a shape, a hook, something memorable ("61-year-old fisherman
         survives capsize" is here — specific person, specific act,
         dignity)
    8  = "oh, hey —" worthy
    10 = stops you mid-task

- register (1-10): is the UNDERLYING SITUATION something Once could
    write calmly? (NOT whether the source is written calmly — the
    source might be sensational; your rewrite will fix that.)
    1  = no salvageable register (pure politics, markets, gossip)
    3  = casualty-focused disaster coverage, pure PR
    6  = source has amplifier words but the facts underneath are
         calm (e.g. "defies odds to swim to safety" → the underlying
         moment is a quiet act of endurance; rewrite strips "defies
         odds")
    8  = source is already calm; minimal rewrite needed
    10 = perfectly calibrated Once voice already

**CRITICAL: ALWAYS PRODUCE THE REWRITE, without exception.** The editor
uses your rewrite as training signal — for low-scored entries too.
Empty rewrites are not allowed; they block the training loop.

Even if the source is thin, a listicle, a memoir, or clearly not
Once: **still write a faithful retelling in Once's voice**, at
minimum 20 characters, in the city's local language. Don't invent
detail that isn't there — but write something honest about what
the source IS. The editor will decide whether to use it.

Rewrite contract:
- original_text: 1-2 sentences IN THE LOCAL LANGUAGE, applying every
  rule above (20-40 words, no amplifiers, keep proper nouns from the
  source, never invent). Substantial paraphrase — the source's voice
  is NOT your voice.
- english_text: faithful English rendering. Empty if original is "en".
- local_hour (0-23): infer from phrasing; 12 if unknown.
- milk_price_local / eggs_price_local / milk_price_usd /
  eggs_price_usd: approximate current prices. 0 if truly unknown.
- rationale: one sentence for the editor, explaining YOUR VERDICT
  (not the source).

Always return valid JSON matching the schema, even when rejecting.`;

const FULL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    score_specificity: { type: "integer", minimum: 1, maximum: 10 },
    score_resonance: { type: "integer", minimum: 1, maximum: 10 },
    score_register: { type: "integer", minimum: 1, maximum: 10 },
    rationale: { type: "string" },
    passed: { type: "boolean" },
    original_language: { type: "string" },
    original_text: { type: "string" },
    english_text: { type: "string" },
    local_hour: { type: "integer", minimum: 0, maximum: 23 },
    milk_price_local: { type: "number", minimum: 0 },
    eggs_price_local: { type: "number", minimum: 0 },
    milk_price_usd: { type: "number", minimum: 0 },
    eggs_price_usd: { type: "number", minimum: 0 }
  },
  required: [
    "score_specificity",
    "score_resonance",
    "score_register",
    "rationale",
    "passed",
    "original_language",
    "original_text",
    "english_text",
    "local_hour",
    "milk_price_local",
    "eggs_price_local",
    "milk_price_usd",
    "eggs_price_usd"
  ]
} as const;

const PREFILTER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    pass: { type: "boolean" },
    why: { type: "string" },
    title_en: { type: "string" }
  },
  required: ["pass", "why", "title_en"]
} as const;

// --- result types ---------------------------------------------------

export interface IngestResult {
  city_id: string | null;
  city_name: string | null;
  queued_id: string | null;       // first queued row's uuid (winner), if any
  queued_ids: string[];           // all queued uuids for this run
  reason: string;                 // human-readable summary
  entries_considered: number;
  entries_prefilter_pass: number;
  /** Top-ranked candidate's scores, if any were queued. */
  scores?: { specificity: number; resonance: number; register: number };
}

// --- dedup helpers --------------------------------------------------

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/** Normalize for content hash: lowercase, collapse whitespace. */
function normalizeForContentHash(title: string, snippet: string): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/[^\p{L}\p{N} ]+/gu, "")
      .trim();
  return norm(title) + "|" + norm(snippet.slice(0, 200));
}

/**
 * Filter out entries already seen in the last 30 days (URL or content
 * hash match). Also records all surviving URLs as seen so the next run
 * skips them. Called before the prefilter so we never waste tokens on
 * duplicates.
 */
async function dedupEntries(entries: FeedEntry[]): Promise<FeedEntry[]> {
  if (entries.length === 0) return entries;
  const sql = requireSql();

  const withHashes = entries.map((e) => ({
    entry: e,
    urlHash: sha256(e.link.split("?")[0]),
    contentHash: sha256(normalizeForContentHash(e.title, e.snippet))
  }));

  const urlHashes = withHashes.map((w) => w.urlHash);
  const contentHashes = withHashes.map((w) => w.contentHash);

  const seen = (await sql`
    select url_hash, content_hash from seen_urls
    where url_hash = any(${urlHashes})
       or content_hash = any(${contentHashes})
  `) as unknown as { url_hash: string; content_hash: string | null }[];

  const seenUrlHashes = new Set(seen.map((r) => r.url_hash));
  const seenContentHashes = new Set(
    seen.filter((r) => r.content_hash).map((r) => r.content_hash!)
  );

  const fresh = withHashes.filter(
    (w) =>
      !seenUrlHashes.has(w.urlHash) && !seenContentHashes.has(w.contentHash)
  );

  // Record freshly-seen ones now so a concurrent run doesn't double-pick.
  for (const w of fresh) {
    try {
      await sql`
        insert into seen_urls (url_hash, content_hash, source_host)
        values (${w.urlHash}, ${w.contentHash}, ${w.entry.source_host})
        on conflict (url_hash) do nothing
      `;
    } catch (err) {
      console.warn("[pipeline] seen_urls insert failed:", (err as Error).message);
    }
  }

  return fresh.map((w) => w.entry);
}

// --- main entry point -----------------------------------------------

export async function runIngest(opts: { cityId?: string } = {}): Promise<IngestResult> {
  const sql = requireSql();

  // 1. Pick a city (or use the one specified).
  let city: City | null = null;
  if (opts.cityId) {
    const rows = (await sql`
      select id, name, country, region, timezone,
        lat::float8 as lat, lng::float8 as lng,
        currency_code, currency_symbol, original_language,
        location_summary, rss_feeds, is_active, last_ingest_at
      from cities where id = ${opts.cityId}
    `) as unknown as City[];
    city = rows[0] ?? null;
  } else {
    city = await pickCity();
  }

  if (!city) {
    return {
      city_id: null,
      city_name: null,
      queued_id: null,
      queued_ids: [],
      reason: "no active city available",
      entries_considered: 0,
      entries_prefilter_pass: 0
    };
  }

  // 2. Fetch entries.
  const rawEntries = await fetchCityEntries(city);
  await markCityIngested(city.id);

  if (rawEntries.length === 0) {
    return {
      city_id: city.id,
      city_name: city.name,
      queued_id: null,
      queued_ids: [],
      reason: "no entries from RSS (maybe feeds are empty)",
      entries_considered: 0,
      entries_prefilter_pass: 0
    };
  }

  // 3. Dedup against the 30-day seen_urls cache. Cheap: one SELECT.
  const entries = await dedupEntries(rawEntries);
  const dedupedOut = rawEntries.length - entries.length;

  if (entries.length === 0) {
    return {
      city_id: city.id,
      city_name: city.name,
      queued_id: null,
      queued_ids: [],
      reason: `all ${rawEntries.length} entries already seen in last 30 days`,
      entries_considered: rawEntries.length,
      entries_prefilter_pass: 0
    };
  }

  // 4. Pre-filter. Bail out early if budget is tight.
  const prefilterCost = estimateCost({
    model: PREFILTER_MODEL,
    promptTokens: 1200,
    cachedTokens: 1000,
    completionTokens: 20
  }) * entries.length;
  await assertBudget(prefilterCost);

  const prefiltered = await runPrefilter(entries, city);

  if (prefiltered.length === 0) {
    return {
      city_id: city.id,
      city_name: city.name,
      queued_id: null,
      queued_ids: [],
      reason: `nothing passed pre-filter (${entries.length} fresh, ${dedupedOut} dedup'd)`,
      entries_considered: rawEntries.length,
      entries_prefilter_pass: 0
    };
  }

  // 5. Full pass on top N candidates.
  const topN = prefiltered.slice(0, TOP_N_FOR_FULL_PASS);
  const scored: Array<{
    entry: FeedEntry;
    full: FullResult;
  }> = [];

  for (const e of topN) {
    try {
      const full = await runFullPass(e, city);
      scored.push({ entry: e, full });
    } catch (err) {
      console.warn("[pipeline] full pass failed:", (err as Error).message);
    }
  }

  if (scored.length === 0) {
    return {
      city_id: city.id,
      city_name: city.name,
      queued_id: null,
      queued_ids: [],
      reason: "all full-pass evaluations errored",
      entries_considered: rawEntries.length,
      entries_prefilter_pass: prefiltered.length
    };
  }

  // 6. Rank by the minimum of the three scores, then by sum as tie-breaker.
  //    Prefer candidates where NO dimension is weak.
  scored.sort((a, b) => {
    const am = Math.min(a.full.score_specificity, a.full.score_resonance, a.full.score_register);
    const bm = Math.min(b.full.score_specificity, b.full.score_resonance, b.full.score_register);
    if (bm !== am) return bm - am;
    const as = a.full.score_specificity + a.full.score_resonance + a.full.score_register;
    const bs = b.full.score_specificity + b.full.score_resonance + b.full.score_register;
    return bs - as;
  });

  // Scores rank; they don't gate. The editor sees top-5 per city no
  // matter what — even low-scored ones are useful signal about the
  // feed's register. Rewrite text is nice-to-have: cards show the
  // source headline regardless.
  const queueable = scored;

  // 7. Weather (best effort).
  const weather = await fetchWeatherLabel(city.lat, city.lng);

  // 8. Write top-K to moderation_queue with rank 1..K.
  const toQueue = queueable.slice(0, TOP_PER_CITY);
  const queuedIds: string[] = [];
  for (let i = 0; i < toQueue.length; i++) {
    const s = toQueue[i];
    const minScore = Math.min(
      s.full.score_specificity,
      s.full.score_resonance,
      s.full.score_register
    );
    const clearedThreshold = minScore >= SCORE_THRESHOLD;
    try {
      const id = await writeQueue({
        city,
        entry: s.entry,
        full: s.full,
        passedFilter: clearedThreshold,
        weather,
        rank: i + 1
      });
      queuedIds.push(id);
    } catch (err) {
      console.warn("[pipeline] writeQueue failed:", (err as Error).message);
    }
  }

  const winner = toQueue[0];
  const winnerMin = Math.min(
    winner.full.score_specificity,
    winner.full.score_resonance,
    winner.full.score_register
  );

  return {
    city_id: city.id,
    city_name: city.name,
    queued_id: queuedIds[0] ?? null,
    queued_ids: queuedIds,
    reason: `queued ${queuedIds.length} (rank 1 min=${winnerMin}, ${dedupedOut} dedup'd)`,
    entries_considered: rawEntries.length,
    entries_prefilter_pass: prefiltered.length,
    scores: {
      specificity: winner.full.score_specificity,
      resonance: winner.full.score_resonance,
      register: winner.full.score_register
    }
  };
}

// ---------------------------------------------------------------- //
// Batch mode — run ingest for every active city, sequentially.     //
// Called by the daily cron at 3:30am.                              //
// ---------------------------------------------------------------- //

export async function runBatchIngest(): Promise<{
  cities_run: number;
  total_queued: number;
  per_city: IngestResult[];
}> {
  const sql = requireSql();
  const rows = (await sql`
    select id from cities where is_active = true
    order by coalesce(last_ingest_at, 'epoch'::timestamptz) asc
  `) as unknown as { id: string }[];

  const perCity: IngestResult[] = [];
  let totalQueued = 0;
  for (const r of rows) {
    try {
      const result = await runIngest({ cityId: r.id });
      perCity.push(result);
      totalQueued += result.queued_ids.length;
    } catch (err) {
      console.warn(
        `[pipeline] batch run failed for ${r.id}:`,
        (err as Error).message
      );
      perCity.push({
        city_id: r.id,
        city_name: null,
        queued_id: null,
        queued_ids: [],
        reason: `error: ${(err as Error).message}`,
        entries_considered: 0,
        entries_prefilter_pass: 0
      });
    }
  }

  return {
    cities_run: perCity.length,
    total_queued: totalQueued,
    per_city: perCity
  };
}

// --- pre-filter -----------------------------------------------------

async function runPrefilter(
  entries: FeedEntry[],
  city: City
): Promise<FeedEntry[]> {
  const kept: FeedEntry[] = [];

  for (const e of entries) {
    let pass = false;
    let why = "";
    try {
      const resp = await client().chat.completions.create({
        model: PREFILTER_MODEL,
        temperature: 0.2,
        max_tokens: 60,
        messages: [
          { role: "system", content: PREFILTER_SYSTEM },
          {
            role: "user",
            content: `Entry (from ${city.name}, ${city.country}):\n\n<article-content>\nTITLE: ${e.title}\nSNIPPET: ${e.snippet}\nSOURCE: ${e.source_host}\n</article-content>`
          }
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "PrefilterVerdict",
            strict: true,
            schema: PREFILTER_SCHEMA
          }
        }
      });

      const raw = resp.choices[0]?.message?.content ?? "{}";
      const j = JSON.parse(raw) as {
        pass: boolean;
        why: string;
        title_en?: string;
      };
      pass = !!j.pass;
      why = (j.why || "").slice(0, 200);
      const titleEn = (j.title_en || "").slice(0, 300).trim() || null;

      await recordSpend(
        {
          model: PREFILTER_MODEL,
          promptTokens: resp.usage?.prompt_tokens ?? 0,
          cachedTokens: resp.usage?.prompt_tokens_details?.cached_tokens ?? 0,
          completionTokens: resp.usage?.completion_tokens ?? 0
        },
        "ingest_prefilter",
        null
      );

      await logDecision({
        city_id: city.id,
        source_url: e.link,
        source_title: e.title,
        source_title_en: titleEn,
        source_snippet: e.snippet,
        stage: "prefilter",
        verdict: pass ? "pass" : "fail",
        rationale: why
      });
    } catch (err) {
      console.warn("[pipeline] prefilter error:", (err as Error).message);
    }

    if (pass) kept.push(e);
  }

  return kept;
}

// --- full pass ------------------------------------------------------

interface FullResult {
  score_specificity: number;
  score_resonance: number;
  score_register: number;
  rationale: string;
  passed: boolean;
  original_language: string;
  original_text: string;
  english_text: string;
  local_hour: number;
  milk_price_local: number;
  eggs_price_local: number;
  milk_price_usd: number;
  eggs_price_usd: number;
}

async function runFullPass(
  entry: FeedEntry,
  city: City
): Promise<FullResult> {
  const userContent = [
    `CITY: ${city.name}, ${city.country}`,
    `LOCAL LANGUAGE: ${city.original_language ?? "unknown"}`,
    `CURRENCY: ${city.currency_code ?? "?"} (${city.currency_symbol ?? "?"})`,
    "",
    `<article-content>`,
    `SOURCE: ${entry.source_host}`,
    `URL: ${entry.link}`,
    `TITLE: ${entry.title}`,
    "",
    `BODY:`,
    entry.content && entry.content.length > entry.snippet.length
      ? entry.content
      : entry.snippet,
    `</article-content>`
  ].join("\n");

  const resp = await client().chat.completions.create({
    model: FULL_MODEL,
    temperature: 0.5,
    max_tokens: 900,
    messages: [
      { role: "system", content: FULL_SYSTEM },
      { role: "user", content: userContent }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "OnceFullEval",
        strict: true,
        schema: FULL_SCHEMA
      }
    }
  });

  const raw = resp.choices[0]?.message?.content ?? "{}";
  const out = JSON.parse(raw) as FullResult;

  const usage: UsageBreakdown = {
    model: FULL_MODEL,
    promptTokens: resp.usage?.prompt_tokens ?? 0,
    cachedTokens: resp.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    completionTokens: resp.usage?.completion_tokens ?? 0
  };
  await recordSpend(usage, "ingest_full", null);

  await logDecision({
    city_id: city.id,
    source_url: entry.link,
    source_title: entry.title,
    source_snippet: entry.snippet,
    stage: "score",
    verdict: out.passed ? "pass" : "fail",
    score_specificity: out.score_specificity,
    score_resonance: out.score_resonance,
    score_register: out.score_register,
    rationale: out.rationale
  });

  return out;
}

// --- writers --------------------------------------------------------

async function writeQueue(args: {
  city: City;
  entry: FeedEntry;
  full: FullResult;
  passedFilter: boolean;
  weather: string | null;
  rank: number;
}): Promise<string> {
  const { city, entry, full, passedFilter, weather, rank } = args;
  const sql = requireSql();

  // Hero image — try OG scrape of the source article, fall back to a
  // watercolor map of the city (on-brand with the postmark stamp), and
  // only use the deterministic picsum placeholder as a last resort.
  const photoUrl = await resolveHeroImage(
    entry.link,
    `${city.id}-${entry.title}`,
    { lat: city.lat, lng: city.lng }
  );

  const rows = (await sql`
    insert into moderation_queue (
      status, source_url, source_input, source_hint_city,
      ai_model, ai_rationale, ai_passed_filter,
      photo_url,
      country, region, city, timezone, local_hour,
      lat, lng,
      original_language, original_text, english_text,
      currency_code, currency_symbol,
      milk_price_local, eggs_price_local,
      milk_price_usd, eggs_price_usd,
      location_summary, weather_current, fetched_at,
      score_specificity, score_resonance, score_register,
      city_id, rank
    ) values (
      'pending',
      ${entry.link},
      ${entry.title + "\n\n" + entry.snippet},
      ${city.name},
      ${FULL_MODEL},
      ${full.rationale},
      ${passedFilter},
      ${photoUrl},
      ${city.country},
      ${city.region ?? null},
      ${city.name},
      ${city.timezone},
      ${full.local_hour},
      ${city.lat},
      ${city.lng},
      ${full.original_language || city.original_language || "en"},
      ${full.original_text},
      ${full.english_text},
      ${city.currency_code ?? null},
      ${city.currency_symbol ?? null},
      ${full.milk_price_local || 0},
      ${full.eggs_price_local || 0},
      ${full.milk_price_usd || 0},
      ${full.eggs_price_usd || 0},
      ${city.location_summary ?? null},
      ${weather},
      now(),
      ${full.score_specificity},
      ${full.score_resonance},
      ${full.score_register},
      ${city.id},
      ${rank}
    )
    returning id
  `) as unknown as { id: string }[];

  const id = rows[0].id;

  await logDecision({
    city_id: city.id,
    source_url: entry.link,
    source_title: entry.title,
    source_snippet: entry.snippet,
    stage: "rewrite",
    verdict: "selected",
    score_specificity: full.score_specificity,
    score_resonance: full.score_resonance,
    score_register: full.score_register,
    rationale: full.rationale,
    queue_id: id
  });

  return id;
}

async function logDecision(args: {
  city_id: string | null;
  source_url: string;
  source_title: string;
  source_title_en?: string | null;
  source_snippet: string;
  stage: "prefilter" | "score" | "rewrite";
  verdict: "pass" | "fail" | "selected";
  score_specificity?: number;
  score_resonance?: number;
  score_register?: number;
  rationale?: string;
  queue_id?: string;
}): Promise<void> {
  const sql = requireSql();
  await sql`
    insert into ai_decisions (
      city_id, source_url, source_title, source_title_en, source_snippet,
      stage, verdict,
      score_specificity, score_resonance, score_register,
      rationale, queue_id
    ) values (
      ${args.city_id},
      ${args.source_url},
      ${args.source_title.slice(0, 500)},
      ${args.source_title_en ?? null},
      ${args.source_snippet.slice(0, 1000)},
      ${args.stage},
      ${args.verdict},
      ${args.score_specificity ?? null},
      ${args.score_resonance ?? null},
      ${args.score_register ?? null},
      ${args.rationale ?? null},
      ${args.queue_id ?? null}
    )
  `;
}
