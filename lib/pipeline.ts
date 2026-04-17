import OpenAI from "openai";
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

/**
 * The ingest pipeline.
 *
 * One run:
 *   1. Pick a city (least-recently-used, randomised in a small bucket).
 *   2. Fetch its RSS feeds, get up to ~40 normalised entries.
 *   3. AI pre-filter (cheap): for each entry, yes/no against the
 *      "small spectacle" rubric, based on title + snippet only.
 *   4. For entries that pass, run the full score + rewrite pass.
 *      This one scores Specificity / Resonance / Register (1-10) and
 *      returns a Once-voice rewrite if all three cross the threshold.
 *   5. Top-scored candidate gets written to moderation_queue; if
 *      nothing cleared the threshold, the pipeline still saves the
 *      highest-scoring entry (per user: "always have news,
 *      even if it's not the best"). It's flagged with a lower
 *      ai_passed_filter so the editor can see why.
 *
 * Every AI call writes a row to ai_decisions for later analysis.
 */

const PREFILTER_MODEL = process.env.INGEST_PREFILTER_MODEL || "gpt-4o-mini";
const FULL_MODEL = process.env.INGEST_FULL_MODEL || "gpt-4o-mini";

// Threshold: any story with all three scores >= this is accepted.
// If nothing reaches it, the top-scored entry is saved anyway.
const SCORE_THRESHOLD = 7;

// Up to N entries go through the expensive full pass per run.
const TOP_N_FOR_FULL_PASS = 4;

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

const RUBRIC = `Once is a quiet web app that shows ONE small moment from somewhere in the world, updated hourly.

WHAT COUNTS AS A GOOD MOMENT (the "small spectacle" bar):
- A specific human, animal, place, or object as the subject.
- A flash of warmth OR quiet sadness OR strangeness OR an uncanny statistic that gives pause OR a small-town dignity.
- 24 hours later you would still remember it. You could describe it to a coworker at lunch in one sentence and they would say "huh".
- Things ordinary enough that they could happen anywhere, but specific enough that they happened in THIS place this hour.
- Examples that QUALIFY:
  * A bookshop that plays the same song at 5pm every day for twenty years played it again today after a week's pause.
  * A 110-year-old woman died; she had lived in the same neighbourhood her whole life.
  * Donated clothes from the US piling on a Kenyan beach; the volume exceeds the local population by 100x.
  * A market stall's regular baker didn't open today; neighbouring stalls left a single flower at the empty spot.
  * A construction crew dug up a lost ring from fifty years ago; the rightful owner is 83.
- Examples that DO NOT qualify:
  * Headline / breaking news / sensational language or exclamation points.
  * Politics, elections, policy, economics, stocks, celebrity.
  * Product launches, promotional events, retail anniversaries.
  * Opinion or advocacy ("we need to...", "it's time to...").
  * Too small: a single line like "someone lost an umbrella" with no shape.
  * Too broad: "Spring has come, cherry blossoms are blooming".
  * Generic announcements without a specific person / object / scene.
`;

const PREFILTER_SYSTEM = `${RUBRIC}

Your job is a FAST ROUGH SCREEN, not the final decision. A more
thorough evaluation happens afterwards with the full article text.
Err heavily on the side of passing — false positives are fine, false
negatives are expensive.

REJECT only when the title clearly signals one of:
  • National politics / elections / policy / diplomacy
  • Stocks, crypto, economics, interest rates, corporate earnings
  • Major-celebrity gossip (royal family, pop stars, reality TV)
  • User questions and recommendations ("where to eat", "looking for",
    "anyone know", "suggestions for")
  • Lists / opinion / advocacy ("5 best…", "why we need…", "our take")
  • Catastrophe headlines with mass casualties (earthquake killing
    dozens, war, bombing) — a single-person death or incident is
    NOT in this bucket, that can still be a Once moment
  • Tech-industry trend pieces ("AI is reshaping…")

PASS anything else, especially when unsure. Treat promotional-sounding
language, "defies odds" phrasing, quirky branding, and unusual topics
as LIKELY Once moments in disguise.

Examples that should PASS even though they sound promotional or
sensational:
  • "Sanrio character defies physics in sumo collaboration" — specific,
    memorable, uncanny.
  • "61-year-old fisherman falls off boat, swims to safety" — specific
    person, specific act, dignity.
  • "Pikachu to cuddle with kimono-clad woman at flower art event" —
    a specific scene, a Once tableau.
  • "Shop owner's cat returns after a week away, eats breakfast as
    usual" — obvious.
Examples that should REJECT:
  • "McDonald's adds Hello Kitty drinks to menu" — pure promo.
  • "Looking for a church near Shinjuku" — user question.
  • "5 best ramen shops in Tokyo" — listicle.

Also return a faithful English rendering of the title (a translation,
not a paraphrase). If the title is already English, copy it.

Return JSON: { "pass": true|false, "why": "<under 15 words>", "title_en": "<english title>" }`;

const FULL_SYSTEM = `${RUBRIC}

You are now doing the full evaluation for one candidate entry.

Score three dimensions (1-10). BE GENEROUS — aim for the middle of
the scale, not the lower end. A title with 2+ concrete nouns
deserves a 6+ on specificity; don't require paragraph-level prose.

- specificity (1-10):
    1 = pure abstraction ("spring has come")
    4 = some detail but generic ("a local shop closed early")
    7 = multiple concrete nouns (named person / place / object / time /
        event). Example passing at 7: "Pikachu cuddling with kimono-
        clad woman on Tokyo street at flower art event" — Pikachu
        (subject), kimono (attire), Tokyo street (place), flower event
        (context) = four concrete elements, that's 7.
    10 = rich scene with sensory detail

- resonance (1-10):
    1 = forgotten in 5 minutes
    4 = mildly interesting
    7 = you would describe this at lunch to get "huh" or "oh". A
        61-year-old fisherman surviving a capsize belongs here — it's
        a whole Beatles-song moment in one sentence.
    10 = the piece stops you mid-task

- register (1-10):
    1 = sensational / breaking-news / exclamation-mark tone
    5 = one of: warmth / quiet sadness / strangeness / uncanny /
        dignity / small wonder. Any of these is a pass.
    10 = perfectly calibrated Once voice

If AT LEAST ONE score is < 5, don't bother rewriting; return scores
+ short rationale, leave moment fields blank.

If all three >= 5, also produce the Once rewrite:
- original_text: 1-2 calm sentences IN THE LOCAL LANGUAGE of the
  location. Not a translation of the source — a retelling in Once's
  voice. Keep ~20-40 words. No exclamation marks. Preserve specific
  names/street/time. Substantial paraphrase (NOT copied wording).
- english_text: a faithful English rendering of original_text.
  Empty if original is English.
- local_hour (0-23): when during the day did the moment occur.
  Infer from phrasing; 12 if unknown.
- milk_price_local / eggs_price_local / milk_price_usd /
  eggs_price_usd: approximate current prices. Use realistic
  estimates. Use 0 if truly unknown.
- rationale: one sentence for the editor.

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
  queued_id: string | null;       // moderation_queue uuid, if any
  reason: string;                 // human-readable summary
  entries_considered: number;
  entries_prefilter_pass: number;
  scores?: { specificity: number; resonance: number; register: number };
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
      reason: "no active city available",
      entries_considered: 0,
      entries_prefilter_pass: 0
    };
  }

  // 2. Fetch entries.
  const entries = await fetchCityEntries(city);
  await markCityIngested(city.id);

  if (entries.length === 0) {
    return {
      city_id: city.id,
      city_name: city.name,
      queued_id: null,
      reason: "no entries from RSS (maybe feeds are empty)",
      entries_considered: 0,
      entries_prefilter_pass: 0
    };
  }

  // 3. Pre-filter. Bail out early if budget is tight.
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
      reason: `nothing passed pre-filter (${entries.length} considered)`,
      entries_considered: entries.length,
      entries_prefilter_pass: 0
    };
  }

  // 4. Full pass on top N candidates.
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
      reason: "all full-pass evaluations errored",
      entries_considered: entries.length,
      entries_prefilter_pass: prefiltered.length
    };
  }

  // 5. Rank by the minimum of the three scores, then by sum as tie-breaker.
  //    Prefer candidates where NO dimension is weak.
  scored.sort((a, b) => {
    const am = Math.min(a.full.score_specificity, a.full.score_resonance, a.full.score_register);
    const bm = Math.min(b.full.score_specificity, b.full.score_resonance, b.full.score_register);
    if (bm !== am) return bm - am;
    const as = a.full.score_specificity + a.full.score_resonance + a.full.score_register;
    const bs = b.full.score_specificity + b.full.score_resonance + b.full.score_register;
    return bs - as;
  });

  const winner = scored[0];
  const minScore = Math.min(
    winner.full.score_specificity,
    winner.full.score_resonance,
    winner.full.score_register
  );
  const clearedThreshold = minScore >= SCORE_THRESHOLD;

  // Weather at the city right now (best effort, non-blocking).
  const weather = await fetchWeatherLabel(city.lat, city.lng);

  // 6. Write to moderation_queue.
  const queuedId = await writeQueue({
    city,
    entry: winner.entry,
    full: winner.full,
    passedFilter: clearedThreshold,
    weather
  });

  return {
    city_id: city.id,
    city_name: city.name,
    queued_id: queuedId,
    reason: clearedThreshold
      ? `queued (all dimensions >= ${SCORE_THRESHOLD})`
      : `queued as fallback (top score by rank, min dim = ${minScore})`,
    entries_considered: entries.length,
    entries_prefilter_pass: prefiltered.length,
    scores: {
      specificity: winner.full.score_specificity,
      resonance: winner.full.score_resonance,
      register: winner.full.score_register
    }
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
            content: `Entry (from ${city.name}, ${city.country}):\n\nTITLE: ${e.title}\nSNIPPET: ${e.snippet}\nSOURCE: ${e.source_host}`
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
    `SOURCE: ${entry.source_host}`,
    `URL: ${entry.link}`,
    `TITLE: ${entry.title}`,
    "",
    `BODY:`,
    entry.content && entry.content.length > entry.snippet.length
      ? entry.content
      : entry.snippet
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
}): Promise<string> {
  const { city, entry, full, passedFilter, weather } = args;
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
      score_specificity, score_resonance, score_register
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
      ${full.score_register}
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
