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
import { fetchArticleBody } from "./articleBody";

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
const SCORE_MODEL = process.env.INGEST_SCORE_MODEL || "gpt-4o-mini";
// Rewrite is what the editor + readers actually see — spend on it.
const REWRITE_MODEL_INGEST = process.env.INGEST_REWRITE_MODEL || "gpt-4o";
// Kept for historical compat in writeQueue's ai_model column.
const FULL_MODEL = REWRITE_MODEL_INGEST;

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

**CITY-MATCH REJECT**: The user provides a target city. Some feeds
are global (Rest of World, Hakai, Atlas Obscura) or regional (The
Diplomat Central Asia, Global Voices, Religion News Service); others
are local. The rule is REGIONAL, not national:

- REJECT when the article is clearly about a different **region**
  than the target city — e.g. a Rest of World piece about Brazil
  when the target is Lagos (Africa vs. S.America); a Mongabay piece
  about Indonesia when the target is Lima (SE Asia vs. S.America);
  a Religion Unplugged piece about American churches when the
  target is Cairo (N.America vs. MENA).
- PASS when the article is about a neighbouring or same-region
  country. A piece about Kyrgyzstan village life is fine for
  Almaty (both Central Asia). A Tunisian sports story is fine for
  Marrakech. A Brazilian piece is fine for São Paulo even if it's
  about a different Brazilian city.
- PASS anything with no clear location marker — let scoring decide.

Use the city's country / continent / cultural region as the match,
not the city itself. When in doubt, PASS.

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
  • **COMMERCIAL / EVENT-PROMO**: exhibition openings, festival
    lineups, product launches, store openings, tourist attractions,
    tourism statistics, anything whose publication date depends on a
    ticketed event or buyable product existing. "New Totoro
    carabiners", "TeamLab exhibit opens in Chiba", "Pokémon footbath
    opens this spring", "Haikyu fan event", "Hitachi Nemophila 5.3
    million in bloom" — reject all. If the title is fundamentally a
    come-here-and-buy/see-this announcement, reject.
  • **MEMOIR / REFLECTION / TIME-SPANNING**: "Reflects on",
    "Looking back", "I remember when", "A childhood among…", "Growing
    up in…", "How I learned to…". Once is about moments happening
    now, not remembered lives.

Examples that SHOULD PASS at prefilter:
  • "Heavy rain floods Tianjin; one resident rows an inflatable boat" —
    human scene within a weather event.
  • "61-year-old fisherman falls off boat, swims to safety" — one
    person, one bounded act.
  • "How Saigon's free water coolers quench thirst and spread kindness" —
    a social practice, humans at the centre.
  • "How China's Deaf Delivery Riders Find a New Life in Gig Work" —
    a group of workers, a systemic B-story (algorithm + disability).
  • "Rescue Team Saves Injured Man from Ravine at Þingvallarvatn" —
    bounded incident, named place, named actors.

Examples that should REJECT at prefilter:
  • "McDonald's adds Hello Kitty drinks to menu" — pure promo.
  • "Looking for a church near Shinjuku" — user question.
  • "5 best ramen shops in Tokyo" — listicle.
  • "Bitcoin hits $90k" — markets.
  • "PM announces new tax policy" — national politics.

Also return a faithful English rendering of the title (a translation,
not a paraphrase). If the title is already English, copy it.

Return JSON: { "pass": true|false, "why": "<under 15 words>", "title_en": "<english title>" }`;

export const REWRITE_SYSTEM_INGEST = `${ONCE_HEADER}

YOUR JOB: this candidate already passed scoring. Produce one
Once-voiced rewrite of the underlying moment, aimed at a reader
from elsewhere.

**WRITE CINEMATICALLY, NOT JOURNALISTICALLY.** The rewrite should
read like the opening shot of a short film — specific objects,
specific bodies, a frame you could photograph. Not a news summary.

Concretely, when the body provides them, INCLUDE:
- **Named physical objects** with defining detail:
  "10-litre stainless steel buckets" not "containers";
  "an electric scooter" not "transportation";
  "fallen leaves covering an abandoned swimming pool" not "an old pool".
- **Bodies + gestures**: what is a specific person DOING with their
  body? "hands clasped in prayer", "holding a scooter up proudly",
  "a chair thrown from a second-floor window".
- **Stakes EMBEDDED as fact, not rhetoric**: when the article
  carries a number that carries the B-story, include it.
  "there are fewer than 80 left" > "endangered";
  "2000 sheep now, from 100 a decade ago" > "population recovering".
- **Outsider-readable inline translations**: Once readers are "from
  elsewhere." Translate local terms inline: write "busy Ikebukuro
  Station" not "Ikebukuro Station"; "an old-fashioned penny candy
  shop (dagashiya)" not "dagashiya"; "the Grain Rain solar term"
  not just "谷雨". One foreign word per sentence max.
- **One POV when possible**: write from inside ONE person's hour —
  the baker's, the rescuer's, the caregiver's. Not an omniscient
  narrator summing up a phenomenon.

Concretely, FORBID:
- Editorializing verbs: "transforming", "bringing solace", "a
  testament to", "quenches thirst and spreads kindness".
  Show the scene instead; let the reader feel the verb.
- Summary clauses: "serving as a reminder that…", "highlighting
  the importance of…"
- Vague emotional shorthand: "was moved by", "felt a sense of".
  Replace with the physical detail that produced the emotion.
- **CLOSING EDITORIAL CLAUSE — ZERO TOLERANCE.** This is the
  single most common failure. Your FINAL SENTENCE MUST BE A
  CONCRETE FACT, not an interpretation. Before you submit, read
  your last sentence. If it contains any of these shapes, DELETE
  IT entirely — the rewrite is better without it:

    • "…which shows that / which reminds us / a testimony to…"
    • "…where tradition meets modernity / where hope meets fear…"
    • "…love even in old age still finds space / hope and
       ignorance intersect / reflected on life's defining decision…"
    • Any sentence using abstract nouns (hope, love, memory,
       tradition, ignorance, resilience) as its subject.
    • Any sentence that would be removable without changing a
       single photographable fact.

  The last sentence must describe a concrete thing: what someone
  said, did, or noticed. END ON THE SCENE. The reader supplies
  the meaning. If you can't end on a fact, end one sentence earlier.

- **PLACE NAMES AS BARE LABELS — HARD RULE.** Every place name
  in your rewrite MUST earn its place. TEST: read the sentence
  with the name removed. If it reads as well or better, CUT THE
  NAME. Bare labels like "South Spruce and East Adams", "Avenida
  Imirim", "Vila Olímpia" are noise for an outsider reader.
  Either (a) attach a texture — "the foggy Oregon coast town of
  Cannon Beach", "the Imirim bus stop where the 971D-10 keeps
  passing without stopping" — or (b) just describe it
  anonymously: "a quiet intersection at dawn", "the bus stop
  on her commute", "a hillside street". Rule: one specific
  place-and-texture or none. Never a bare address.

- **FULL NAMES WHEN FIRST-NAME IS MORE INTIMATE.** For Once,
  intimacy beats formality. Use FIRST NAME ONLY unless the
  language's convention is otherwise. Chinese keeps full name
  (林小雨, 三橋義弘). Spanish, Portuguese, French, English,
  Italian, Arabic: first name, occasionally with one-word role
  — "Sophia", "Mozana, a cleaner", "Hadia". Not "Sophia Lundy",
  not "Mozana Santos", not "Hadia al-Qabsia".

- **FLATTEN INTO ONE-DIMENSIONAL MORAL CLARITY.** The world is
  contradictory. If the source shows a victim, hint at the
  attacker's humanity too; if it shows a success story, keep the
  struggle in frame; if it shows a thief, leave room for their
  backstory. Write toward complexity, not toward a lesson.

LENGTH: **20–35 words.** Tighter than before. Every word earns
its place. 字字如金 — each word load-bearing. If you can't fit,
cut the place name before you cut the human detail.

LANGUAGE DISCIPLINE: original_text MUST be in the city's local_language.
- If local_language is "en", original_text is in ENGLISH and
  english_text is "".
- Otherwise, english_text is a faithful English rendering.
- Never default to Chinese or any other language — match the city.

Return JSON only: { original_language, original_text, english_text }.`;

const FULL_SYSTEM = `${ONCE_HEADER}

YOUR JOB: evaluate one candidate entry. Score the UNDERLYING MOMENT's
potential to become a Once story, then — if it has potential — write
the Once rewrite.

CRITICAL — score the MOMENT, not the source prose.

**LOOK PAST THE FRAMING.** A piece headlined as a trend piece, a
product launch, or a generic scene can CONTAIN a buried Once
moment (a minor character's specific act, an overheard remark,
a concrete one-sentence anchor the editor almost cut). Scan the
BODY. If you find a zoomable A+B moment inside, SCORE THE CANDIDATE
ON THAT BURIED MOMENT, not on the article's headline framing.
Don't refuse to see what's inside just because the outside is
commercial.

**LANGUAGE DISCIPLINE — READ CAREFULLY.** The city's LOCAL LANGUAGE
is passed in the user prompt. original_text MUST be written in
that exact language — nothing else. If the city's local_language is
"en", original_text is IN ENGLISH and english_text is empty string.
If it's "ja", original_text is in Japanese. If it's "vi", Vietnamese.
Do NOT default to Chinese or any other language. Match the city.

The source is often written in newspaper voice with amplifier words
("defies odds", "incredibly", "stunning", "must-see"). THAT IS FINE.
Your rewrite will strip those. Judge whether there's a real, specific,
bounded, memorable human moment underneath. If yes, score generously
and rewrite; if not, score low.

BE CALIBRATED. Don't hover at 5-6 out of habit — use the full scale.
The rubric is anchored to specific phenomena, not just vibes.

**HARD FLOORS (apply BEFORE the rubric):**
  • If NO human is present or implicit in the underlying moment
    (no baker, no crew, no crowd, no person's hand, no congregation
    — just objects, places, flora, statues, products, facts) —
    specificity is CAPPED AT 4 and resonance is CAPPED AT 3. A
    flower field with nobody in it, a statue with nobody visiting
    it, a product announcement — all hit these caps.
  • If the piece reads as commercial (product launch, event
    promotion, tourist pitch, retail anniversary) — register is
    CAPPED AT 3, regardless of how calmly it's written. Quirky /
    cute framing does NOT earn commercial pieces a pass.
  • If the piece is a first-person memoir / reflection / "how I
    learned" essay — resonance is CAPPED AT 3, regardless of
    specificity. Once is third-person observation, not self-reflection.

**THEN SCORE:**

- specificity (1-10): does the underlying moment have named anchors
  around a human?
    1  = pure abstraction ("spring has come")
    4  = some detail but no human ("5 million flowers in bloom",
         "a temple's 11-headed statue") — CAP for no-human pieces
    6  = ONE concrete anchor (named place OR named person) + a verb
         a human is doing
    8  = multiple named anchors + a specific human action at a
         specific time
    10 = photographable scene with sensory detail, a real person
         doing a real thing

- resonance (1-10): does the surface fact carry a B-story — a
  current underneath that gives it weight? This is the MOST
  IMPORTANT axis for Once.
    1  = no B-story at all; pure fact ("flowers are blooming",
         "bars can open later")
    3  = faint B-story, but you have to squint for it — CAP for
         commercial pieces and for memoirs
    5  = B-story present but thin ("61-year-old survives capsize"
         — dignity and endurance are beneath, but the writer
         doesn't develop them)
    7  = B-story is clear; a reader feels it without being told
         ("market stalls left a flower at the absent baker's empty
         spot" — grief, continuity, community, all in one gesture)
    9-10 = the B-story hits you. 24 hours later, the moment
         still turns over in your head.

- register (1-10): would a restrained rewrite land in Once's voice,
  or is the underlying situation un-salvageable?
    1  = pure politics, markets, gossip; cannot be rewritten
    3  = casualty-focused disaster coverage; promotional/commercial
         pieces (CAP)
    5  = neutral-enough news brief; the source has amplifiers
         ("defies odds", "stunning", "must-visit") but the facts
         underneath are calm
    7  = clean; minimal amplifier stripping needed
    10 = already in Once's voice; no lift required

Return scores + one-sentence rationale + local_hour + approximate
prices. **DO NOT produce a rewrite here** — a separate, more
capable pass handles rewrites for candidates that clear the score
floor. Your job ends at scoring.

- score_specificity, score_resonance, score_register: integers 1-10
- rationale: one sentence for the editor explaining YOUR VERDICT
- local_hour (0-23): infer from phrasing; 12 if unknown
- milk_price_local / eggs_price_local / milk_price_usd /
  eggs_price_usd: approximate current prices. 0 if unknown

Always return valid JSON matching the schema.`;

const SCORE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    score_specificity: { type: "integer", minimum: 1, maximum: 10 },
    score_resonance: { type: "integer", minimum: 1, maximum: 10 },
    score_register: { type: "integer", minimum: 1, maximum: 10 },
    rationale: { type: "string" },
    passed: { type: "boolean" },
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
    "local_hour",
    "milk_price_local",
    "eggs_price_local",
    "milk_price_usd",
    "eggs_price_usd"
  ]
} as const;

// Rewrite pass runs on scoring-passers only. Outputs just the text.
export const REWRITE_INGEST_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    original_language: { type: "string" },
    original_text: { type: "string" },
    english_text: { type: "string" }
  },
  required: ["original_language", "original_text", "english_text"]
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

  // Hard floor: min-of-three < 4 means the candidate is neither
  // specific enough, nor resonant enough, nor calm enough to ever
  // be worth the reviewer's time. Dropping them saves attention +
  // avoids training the reviewer to expect garbage. If nothing
  // clears the floor, we queue NOTHING for this city — empty queue
  // is better than false positives.
  const SCORE_FLOOR = 4;
  const queueable = scored.filter(
    (s) =>
      Math.min(
        s.full.score_specificity,
        s.full.score_resonance,
        s.full.score_register
      ) >= SCORE_FLOOR
  );

  if (queueable.length === 0) {
    return {
      city_id: city.id,
      city_name: city.name,
      queued_id: null,
      queued_ids: [],
      reason: `scored ${scored.length}, none cleared min>=${SCORE_FLOOR}`,
      entries_considered: rawEntries.length,
      entries_prefilter_pass: prefiltered.length
    };
  }

  // 7. Weather (best effort).
  const weather = await fetchWeatherLabel(city.lat, city.lng);

  // 8. Rewrite (gpt-4o) for each survivor, then write top-K to queue.
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
      const body = s.full._bodyText ?? s.entry.snippet;
      const rewrite = await runRewriteIngest(s.entry, city, body);
      const enriched: FullResult = {
        ...s.full,
        original_language: rewrite.original_language || s.full.original_language,
        original_text: rewrite.original_text,
        english_text: rewrite.english_text
      };
      const id = await writeQueue({
        city,
        entry: s.entry,
        full: enriched,
        passedFilter: clearedThreshold,
        weather,
        rank: i + 1
      });
      queuedIds.push(id);
    } catch (err) {
      console.warn("[pipeline] rewrite/writeQueue failed:", (err as Error).message);
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
  /** Internal — what body source fed the scoring pass. */
  _bodyText?: string;
  _bodySource?: string;
  _paywalled?: boolean;
}

async function runFullPass(
  entry: FeedEntry,
  city: City
): Promise<FullResult> {
  // Try to recover the real article body so the scorer and (later)
  // rewrite pass have substance to work with. Falls back to RSS
  // content/snippet if the site is paywalled or blocks scrapers.
  const fetched = await fetchArticleBody(entry.link);
  const rssBody =
    entry.content && entry.content.length > entry.snippet.length
      ? entry.content
      : entry.snippet;

  const bodyText = fetched.text && fetched.text.length > rssBody.length
    ? fetched.text
    : rssBody;
  const bodySource = fetched.text ? fetched.source : "rss";
  const paywalled = fetched.paywalled;

  const userContent = [
    `CITY: ${city.name}, ${city.country}`,
    `LOCAL LANGUAGE: ${city.original_language ?? "unknown"}`,
    `CURRENCY: ${city.currency_code ?? "?"} (${city.currency_symbol ?? "?"})`,
    "",
    `<article-content>`,
    `SOURCE: ${entry.source_host}`,
    `URL: ${entry.link}`,
    `TITLE: ${entry.title}`,
    `BODY_SOURCE: ${bodySource}${paywalled ? " (PAYWALLED — teaser only; downgrade scores accordingly)" : ""}`,
    "",
    `BODY:`,
    bodyText,
    `</article-content>`
  ].join("\n");

  // ---------- SCORING PASS (cheap model) ----------
  const scoreResp = await client().chat.completions.create({
    model: SCORE_MODEL,
    temperature: 0.4,
    max_tokens: 400,
    messages: [
      { role: "system", content: FULL_SYSTEM },
      { role: "user", content: userContent }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "OnceScore",
        strict: true,
        schema: SCORE_SCHEMA
      }
    }
  });
  const scoreRaw = scoreResp.choices[0]?.message?.content ?? "{}";
  const scored = JSON.parse(scoreRaw) as Omit<
    FullResult,
    "original_language" | "original_text" | "english_text" | "_bodyText" | "_bodySource" | "_paywalled"
  >;

  await recordSpend(
    {
      model: SCORE_MODEL,
      promptTokens: scoreResp.usage?.prompt_tokens ?? 0,
      cachedTokens: scoreResp.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      completionTokens: scoreResp.usage?.completion_tokens ?? 0
    },
    "ingest_score",
    null
  );

  await logDecision({
    city_id: city.id,
    source_url: entry.link,
    source_title: entry.title,
    source_snippet: entry.snippet,
    stage: "score",
    verdict: scored.passed ? "pass" : "fail",
    score_specificity: scored.score_specificity,
    score_resonance: scored.score_resonance,
    score_register: scored.score_register,
    rationale: scored.rationale
  });

  return {
    ...scored,
    original_language: city.original_language ?? "en",
    original_text: "",
    english_text: "",
    _bodyText: bodyText,
    _bodySource: bodySource,
    _paywalled: paywalled
  };
}

/**
 * Rewrite pass. Separate API call, uses the more capable model
 * (gpt-4o by default). Called only for candidates that cleared the
 * score floor and are about to be queued.
 */
async function runRewriteIngest(
  entry: FeedEntry,
  city: City,
  bodyText: string
): Promise<{ original_language: string; original_text: string; english_text: string }> {
  const userContent = [
    `CITY: ${city.name}, ${city.country}`,
    `LOCAL LANGUAGE: ${city.original_language ?? "en"}`,
    "",
    `<article-content>`,
    `SOURCE: ${entry.source_host}`,
    `URL: ${entry.link}`,
    `TITLE: ${entry.title}`,
    "",
    `BODY:`,
    bodyText,
    `</article-content>`
  ].join("\n");

  const resp = await client().chat.completions.create({
    model: REWRITE_MODEL_INGEST,
    temperature: 0.55,
    max_tokens: 700,
    messages: [
      { role: "system", content: REWRITE_SYSTEM_INGEST },
      { role: "user", content: userContent }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "OnceRewriteIngest",
        strict: true,
        schema: REWRITE_INGEST_SCHEMA
      }
    }
  });

  const raw = resp.choices[0]?.message?.content ?? "{}";
  const out = JSON.parse(raw) as {
    original_language: string;
    original_text: string;
    english_text: string;
  };

  await recordSpend(
    {
      model: REWRITE_MODEL_INGEST,
      promptTokens: resp.usage?.prompt_tokens ?? 0,
      cachedTokens: resp.usage?.prompt_tokens_details?.cached_tokens ?? 0,
      completionTokens: resp.usage?.completion_tokens ?? 0
    },
    "ingest_rewrite",
    null
  );

  // Force english_text empty when the city is anglophone — the
  // renderer uses that to decide whether to show the translation block.
  if ((city.original_language ?? "en") === "en") {
    out.english_text = "";
    out.original_language = "en";
  }
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

  // Skip if this URL is already sitting in the pending queue — avoids
  // duplicates when seen_urls has been cleared (e.g. manual reruns)
  // or when two runs overlap.
  const existing = (await sql`
    select id from moderation_queue
    where status = 'pending' and source_url = ${entry.link}
    limit 1
  `) as unknown as { id: string }[];
  if (existing.length > 0) {
    return existing[0].id;
  }

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
