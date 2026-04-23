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
import { resolveHeroImage, ensurePhotoColumns } from "./ogImage";
import { extractPhotoQueries } from "./photoKeywords";
import type { City } from "./types";
import { ONCE_HEADER, SECURITY_NOTE } from "./prompts";
import { fetchArticleBody } from "./articleBody";
import { Journey, type JourneyPhoto } from "./journey";

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

// Threshold (2-axis fit enum): when BOTH axes are strong_fit (int 2),
// the candidate is flagged as ai_passed_filter=true on the queue card.
// Still queued otherwise as long as neither axis is no_fit.
const SCORE_THRESHOLD = 2; // strong_fit on both axes

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

## HOW TO READ THE BODY

Before you write, read the body carefully and find the detail
that **refuses to be only itself** — the detail where a small
action quietly weighs more than it should. This is the phenomenon
you're hunting for; there is no fixed shape to it. The weight
might transfer from anything the body carries: a past, an
absence, a repetition, a silence, a contrast, a season, a ritual,
a chance sound, a crossed line, or something that has no name
yet. Don't pre-specify. Let the body tell you.

Judge your draft by what the reader experiences, not by what
category you matched:

  (a) Did she see something specific? (Not an abstract emotion
      word. Not "sorrow" but the silent kitchen.)
  (b) Did she supply the meaning? (She wasn't handed a lesson.)
  (c) After the last sentence, did she pause for one more second?

If your rewrite fails any of these, rewrite it. If the body
genuinely doesn't provide a weight-carrying detail, write the
honest surface (A+B) and stop — do NOT fabricate weight. Fake
depth is worse than honest shallow.

## HOW TO WRITE — three language axes

The rewrite should satisfy THREE language axes. All three matter; a
failure on any one drops the quality floor.

### L1 · 顺畅 (smoothness)

Outsider readers must be able to read without stumbling. Minimise
proper nouns, local labels, and foreign words. When a local term
earns its place, give an inline translation.

  ✓ "busy Ikebukuro Station" (not bare "Ikebukuro Station")
  ✓ "an old-fashioned penny candy shop (dagashiya)" (not bare "dagashiya")
  ✓ "the foggy Oregon coast town of Cannon Beach" (name + texture)
  ✗ "Na avenida Presidente Castelo Branco, dois adolescentes..."
  ✗ "在池袋駅から徒歩10分の雑司ヶ谷鬼子母神で"

### L2 · 语言质地 (texture of language)

The language itself — selection, word order, sentence length,
punctuation, segmentation, pace, silence, metaphor, tone, tense,
narrative distance — should carry its own presence and match the
subject. Quiet subjects want sparse texture (Carver). Dense subjects
can carry more weight (Tolstoy). ONE style does not fit all.

ALLOWED:
- Warmth toward the human subject, even when the subject is cruel
  or absurd. A rewrite can offer small healing without being
  sentimental.
- A small metaphor, embedded in a concrete image
  ("the absent chair took the shape of her mother's silence" — OK)

BOUNDARY — avoid 文绉绉 / 矫情 / 装饰性:
- NOT "his sorrow was a vast ocean" (too big, decorative)
- NOT three adjectives stacked ("beautiful, tender, unforgettable")
- NOT "like a ~" twice in one rewrite
- NOT a metaphor that announces itself; a good metaphor reads as
  observation, not ornament

Every word must do the work of showing the story. Not of
showing the writer.

### L3 · 画面感 (show, don't tell)

Pull into the rewrite, when the body provides them:
- A NEAR scene — one concrete action, object, or bodily detail
  (a hand steadying a scooter; a pot of broth on a stove; leaves
  covering an empty pool). **At least one near-scene should be
  present whenever the body gives one.**
- A MID scene — the situation around the person (the quiet market,
  the bus stop in the dark, the temple's cold morning)
- A FAR scene — the background dimension that supplies weight
  (the city's construction priorities, the centuries of a statue,
  the sixty years of a family recipe)
- Named physical objects with defining detail
  ("10-litre stainless steel buckets" not "containers")
- Stakes embedded as fact, not rhetoric
  ("fewer than 80 left" > "endangered")
- ONE complicating detail that refuses flat moral framing, when
  the body provides it (the thief's age, the caregiver's own
  doubt)

Third-person limited POV. Stay close to one consciousness without
becoming first-person memoir.

## HARD FORBIDS

**CLOSING EDITORIAL CLAUSE — ZERO TOLERANCE.** Your final
sentence MUST be a concrete fact, not an interpretation. Before
submitting, read your last sentence. If it uses abstract nouns
(hope, love, memory, tradition, resilience, irony) as its
subject, DELETE IT. If it would be removable without changing a
single photographable fact, DELETE IT. End on the scene. The
reader supplies the meaning.

**BARE PLACE NAMES.** Every place name must earn its place. Test:
remove it. If the sentence reads as well or better, cut it. Either
(a) attach texture — "the foggy Oregon coast town of Cannon Beach",
"the Imirim bus stop where the 971D-10 keeps passing without
stopping" — or (b) describe anonymously — "a quiet intersection
at dawn". Never a bare address.

**FULL NAMES where first name is more intimate.** Use first name
only, unless the language's convention is otherwise. Chinese keeps
full name (林小雨, 三橋義弘). Spanish, Portuguese, French, English,
Italian, Arabic: first name, occasionally with a one-word role —
"Sophia", "Mozana, a cleaner", "Hadia". NOT "Sophia Lundy",
"Mozana Santos", "Hadia al-Qabsia".

**EDITORIALIZING VERBS**: "transforming", "bringing solace", "a
testament to", "interweaving", "quenching and spreading". Show
the scene; let the reader feel the verb.

**VAGUE EMOTIONAL SHORTHAND**: "was moved by", "felt a sense of".
Replace with the physical detail that produced the feeling.

**FLAT MORAL CLARITY**: victim-without-attacker-humanity,
success-without-struggle, hero-without-fatigue. Refuse moral
closure. Leave tension held.

LENGTH: **20–35 words.** One or two sentences. 字字如金.
If you can't fit everything, cut the place name before you
cut the human detail.

## CALIBRATION (shape, not content)

No concrete example stories. Pulling specific nouns, numbers, or
scenes from an illustrative example is a HALLUCINATION — those
details are not in the article body you're given, and borrowing
them falsifies the story.

Instead, here is the SHAPE the rewrite should follow, in
abstract terms. Any content must come from the body, never
from this description:

  A person (specific, named as the body names them) does a
  small thing (named verb + named object — both from the body).
  One additional sentence carries a second fact from the body
  that makes the small thing weigh more than itself — a number,
  a context, a contrast, a repetition, a before/after, a
  quoted remark.

  NEVER end on interpretation. NEVER introduce a detail that is
  not in the body. If the body gives you only one layer,
  write one honest sentence and stop.

Self-check before submitting:
  1. Every concrete noun, number, and named object in my
     rewrite — can I point to it in the body? If NO, delete it.
  2. Does my last sentence describe a thing, or interpret a
     thing? If interpret, delete it.
  3. Could a reader supply the meaning, or have I handed it to
     them?

LANGUAGE DISCIPLINE: original_text MUST be in the city's local_language.
- If local_language is "en", original_text is in ENGLISH and
  english_text is "".
- Otherwise, english_text is a faithful English rendering.
- Never default to Chinese or any other language — match the city.

Return JSON only: { original_language, original_text, english_text }.`;

const FULL_SYSTEM = `${ONCE_HEADER}

YOUR JOB: you are Once's content connoisseur. Judge whether the
UNDERLYING MOMENT has potential to become a Once story. Answer
only TWO questions, each with THREE levels of "fit":

  非常符合 (strong_fit)   — clearly yes
  基本符合 (basic_fit)    — yes but thin / borderline
  不符合   (no_fit)        — clearly no

No numeric scores. Language is coarse on purpose — the model should
not try to distinguish "7 vs 8". 3 levels is what you can honestly do.

**LOOK PAST THE FRAMING.** A piece titled as a trend piece, product
launch, or generic scene can CONTAIN a buried Once moment (a minor
character's specific act, an overheard remark, a concrete anchor
the editor almost cut). Scan the BODY. If you find one, JUDGE ON
THAT BURIED MOMENT, not on the headline framing.

---

## AXIS 1 · C1 · 有看头 (watchable)

Is this real life, recent, with a human pulse, more dramatic than a
typical mundane day — something worth telling at a dinner line?

  非常符合: all of: real + recent + has human + 比日常更 dramatic +
           can be told as a dinner-line anecdote
           e.g. four deaf delivery riders chat in sign language, one
           proudly showing his new electric scooter
           e.g. a stroke survivor who once considered suicide now
           travels the country to sit with isolated caregivers
           e.g. free roadside water coolers appear on Saigon's
           sidewalks, shopkeepers cleaning and icing them each morning

  基本符合: real + recent + has human but either too mundane
           (every-day event) or the drama is isolated with no lift
           e.g. a 75-year-old goes missing Friday, is found safe
           e.g. a Brooklyn musician practices an unusual fiddle
           e.g. two teens caught with a stolen motorcycle

  不符合:   no human / not recent / statistics only / policy / memoir
           e.g. "spring has come, cherry blossoms blooming"
           e.g. "Huatulco received 132,000 tourists last Easter"
           e.g. "Langovest installs pilot filtration system at LASUTH"
           e.g. "Yunnan childhood among animals" (memoir, not recent)

HARD FLOORS → C1 = 不符合:
  • NO human present or implicit (pure objects, flora, statues,
    products, statistics) → 不符合
  • First-person memoir / reflection / "how I learned to" /
    "looking back at my childhood" → 不符合
  • Not recent (events more than ~2 weeks old, except as brief
    context for a current moment) → 不符合
  • Commercial / PR / event promotion / product launch / exhibition
    opening / tourism statistics — reads as selling-clicks, not
    observing — → 不符合

---

## AXIS 2 · C2 · 人类共同困境 (shared human condition)

Does the story touch a tension humans cannot resolve — one that
crosses cultures, eras, languages? Possible directions (NOT a
checklist, just pointers): life vs death, love vs loss, freedom vs
fate, absurdity vs meaning, memory vs forgetting, loneliness vs
belonging, the individual vs their era, body vs spirit, dignity
vs circumstance, etc. The sources of human tension are not
enumerable; don't pre-specify.

**Single test:** strip every local detail (place names, personal
names, specific products, local culture-specific references). Is
there a human tension left? If yes strongly → 非常符合. If thinly →
基本符合. If nothing but local fact remains → 不符合.

  非常符合: stripping locality leaves a clear human tension
           e.g. deaf riders (stripped: disabled workers share a
             moment of pride) → tension: dignity vs marginality
           e.g. 彩票送情人 (stripped: person wins something, gives
             to the wrong person, justice intervenes) → tension:
             love vs law; absurdity vs fortune
           e.g. interfaith flight kindness (stripped: strangers
             set down their joy to hold another's grief) → tension:
             self vs other, momentary transcendence

  基本符合: stripping locality leaves a thin or one-dimensional
           human theme, or tension exists but the article doesn't
           develop it
           e.g. free water coolers (stripped: strangers give
             strangers relief from heat) → kindness, single layer
           e.g. helicopter crash, everyone survives (stripped: chance
             + fragility, but story doesn't develop either)
           e.g. missing elderly woman found (stripped: family fear
             + relief — brief, no sustained tension)

  不符合:   stripping locality leaves only administrative or
           informational content, or a curiosity with no tension
           e.g. Langovest filter system (stripped: a company
             installed something) → no tension
           e.g. bars stay open later for World Cup (stripped: a
             regulation change) → no tension
           e.g. Norwegian fiddle practice (stripped: a musician
             practices an instrument) → curiosity, no tension

---

Return:
  c1: one of "strong_fit" | "basic_fit" | "no_fit"
  c2: one of "strong_fit" | "basic_fit" | "no_fit"
  rationale: one sentence explaining YOUR verdict — name the
             buried moment (for c1) and the human tension (for c2).
             If either is "no_fit", briefly say why.
  local_hour (0-23): infer from the body; 12 if unknown
  milk_price_local / eggs_price_local / milk_price_usd /
  eggs_price_usd: approximate current prices. 0 if unknown.

**DO NOT produce a rewrite here** — a separate, more capable pass
handles rewrites for candidates that clear the floor. Your job
ends at scoring.

Always return valid JSON matching the schema.`;

// Fit-level enum used by the 2-axis content scoring.
// Ordered semantically: no_fit < basic_fit < strong_fit.
const FIT_LEVEL = ["no_fit", "basic_fit", "strong_fit"] as const;
type FitLevel = typeof FIT_LEVEL[number];

// Map enum → int for sortability + compat with existing integer columns
// in the moderation_queue + ai_decisions tables.
//   no_fit     = 0 (reject)
//   basic_fit  = 1 (marginal, maybe queue)
//   strong_fit = 2 (strong, definitely queue)
function fitToInt(f: FitLevel): number {
  return FIT_LEVEL.indexOf(f);
}
function intToFit(n: number | null): FitLevel {
  if (n == null) return "no_fit";
  if (n <= 0) return "no_fit";
  if (n === 1) return "basic_fit";
  return "strong_fit";
}

const SCORE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    c1: { type: "string", enum: FIT_LEVEL },
    c2: { type: "string", enum: FIT_LEVEL },
    rationale: { type: "string" },
    local_hour: { type: "integer", minimum: 0, maximum: 23 },
    milk_price_local: { type: "number", minimum: 0 },
    eggs_price_local: { type: "number", minimum: 0 },
    milk_price_usd: { type: "number", minimum: 0 },
    eggs_price_usd: { type: "number", minimum: 0 }
  },
  required: [
    "c1",
    "c2",
    "rationale",
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

// --- runs log --------------------------------------------------------

/**
 * Persist every ingest attempt into pipeline_runs, even ones that
 * produce zero AI decisions (dedup'd-everything, no-entries, no-city).
 * Without this, a "nothing new" run is invisible in the admin UI.
 *
 * The table lives in db/schema.sql but was never applied in
 * production, so we create-if-not-exists here. Also add three columns
 * (city_name, queued_count, trigger) that the original schema didn't
 * include.
 */
let _runsSchemaEnsured = false;
async function ensureRunsSchema(): Promise<void> {
  if (_runsSchemaEnsured) return;
  const sql = requireSql();
  await sql`
    create table if not exists pipeline_runs (
      id             uuid primary key default gen_random_uuid(),
      city_id        text,
      started_at     timestamptz not null default now(),
      finished_at    timestamptz,
      status         text not null default 'running',
      stage          text,
      considered     integer not null default 0,
      prefilter_pass integer not null default 0,
      result_summary text,
      queue_id       uuid,
      error          text
    )
  `;
  await sql`create index if not exists pipeline_runs_started_idx on pipeline_runs(started_at desc)`;
  await sql`alter table pipeline_runs add column if not exists city_name text`;
  await sql`alter table pipeline_runs add column if not exists queued_count integer not null default 0`;
  await sql`alter table pipeline_runs add column if not exists trigger text`;
  _runsSchemaEnsured = true;
}

async function recordRun(
  result: IngestResult,
  trigger: "cron" | "manual",
  errorMsg?: string
): Promise<void> {
  try {
    await ensureRunsSchema();
    const sql = requireSql();
    await sql`
      insert into pipeline_runs
        (city_id, city_name, started_at, finished_at, status,
         considered, prefilter_pass, result_summary,
         queue_id, queued_count, trigger, error)
      values
        (${result.city_id}, ${result.city_name},
         now(), now(),
         ${errorMsg ? "failed" : "completed"},
         ${result.entries_considered}, ${result.entries_prefilter_pass},
         ${result.reason},
         ${result.queued_id}, ${result.queued_ids.length},
         ${trigger}, ${errorMsg ?? null})
    `;
  } catch (err) {
    // Log but don't fail the ingest — the run still happened, the log
    // is just bookkeeping.
    console.warn("[pipeline] recordRun failed:", (err as Error).message);
  }
}

// --- main entry point -----------------------------------------------

export async function runIngest(
  opts: { cityId?: string; trigger?: "cron" | "manual" } = {}
): Promise<IngestResult> {
  const trigger = opts.trigger ?? "manual";
  try {
    const result = await runIngestInner({ cityId: opts.cityId });
    await recordRun(result, trigger);
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await recordRun(
      {
        city_id: opts.cityId ?? null,
        city_name: null,
        queued_id: null,
        queued_ids: [],
        reason: `error: ${msg}`,
        entries_considered: 0,
        entries_prefilter_pass: 0
      },
      trigger,
      msg
    );
    throw err;
  }
}

async function runIngestInner(
  opts: { cityId?: string } = {}
): Promise<IngestResult> {
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
    prefilterMeta: PrefilterMeta;
  }> = [];

  const errors: string[] = [];
  for (const { entry: e, meta: prefMeta } of topN) {
    try {
      const full = await runFullPass(e, city);
      scored.push({ entry: e, full, prefilterMeta: prefMeta });
    } catch (err) {
      const msg = (err as Error).message;
      console.warn("[pipeline] full pass failed:", msg);
      errors.push(msg);
    }
  }

  if (scored.length === 0) {
    const firstErr = errors[0] ?? "?";
    return {
      city_id: city.id,
      city_name: city.name,
      queued_id: null,
      queued_ids: [],
      reason: `all full-pass evaluations errored — first: ${firstErr.slice(0, 180)}`,
      entries_considered: rawEntries.length,
      entries_prefilter_pass: prefiltered.length
    };
  }

  // 6. Rank by min-of-two fit axes (C1 in score_specificity column,
  //    C2 in score_resonance column). Prefer candidates where neither
  //    axis is weak. Break ties by sum.
  scored.sort((a, b) => {
    const am = Math.min(a.full.score_specificity, a.full.score_resonance);
    const bm = Math.min(b.full.score_specificity, b.full.score_resonance);
    if (bm !== am) return bm - am;
    const as = a.full.score_specificity + a.full.score_resonance;
    const bs = b.full.score_specificity + b.full.score_resonance;
    return bs - as;
  });

  // Hard floor: EITHER axis at "不符合" (fit int 0) drops the candidate.
  // Both axes must be at least "基本符合" (fit int >= 1) to reach the queue.
  // Empty queue is better than reviewer-attention-wasting false positives.
  const SCORE_FLOOR = 1; // basic_fit on both axes
  const queueable = scored.filter(
    (s) =>
      Math.min(
        s.full.score_specificity,
        s.full.score_resonance
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
  //    Build a Journey along the way so each card carries a per-stage
  //    trace visible in /admin.
  const toQueue = queueable.slice(0, TOP_PER_CITY);
  const queuedIds: string[] = [];
  for (let i = 0; i < toQueue.length; i++) {
    const s = toQueue[i];
    const minFit = Math.min(
      s.full.score_specificity,
      s.full.score_resonance
    );
    const clearedThreshold = minFit >= SCORE_THRESHOLD; // both strong_fit
    try {
      // Assemble Journey with the metadata we've already collected.
      const journey = new Journey({
        kind: "rss",
        city_id: city.id,
        city_name: city.name,
        feed_url: s.entry.feed_url,
        source_url: s.entry.link,
        source_host: s.entry.source_host,
        entry_title: s.entry.title,
        pub_date: s.entry.pub_date
          ? s.entry.pub_date.toISOString()
          : null
      });
      journey.addPrefilter({
        model: s.prefilterMeta.model,
        pass: s.prefilterMeta.pass,
        why: s.prefilterMeta.why,
        prompt_tokens: s.prefilterMeta.prompt_tokens,
        cached_tokens: s.prefilterMeta.cached_tokens,
        completion_tokens: s.prefilterMeta.completion_tokens,
        cost_usd: s.prefilterMeta.cost_usd,
        ms: s.prefilterMeta.ms
      });
      if (s.full._bodyMeta) {
        journey.addBody(s.full._bodyMeta);
      }
      if (s.full._scoreMeta) {
        journey.addScore({
          model: s.full._scoreMeta.model,
          c1: intToFit(s.full.score_specificity),
          c2: intToFit(s.full.score_resonance),
          rationale: s.full.rationale,
          prompt_tokens: s.full._scoreMeta.prompt_tokens,
          cached_tokens: s.full._scoreMeta.cached_tokens,
          completion_tokens: s.full._scoreMeta.completion_tokens,
          cost_usd: s.full._scoreMeta.cost_usd,
          ms: s.full._scoreMeta.ms
        });
      }

      const body = s.full._bodyText ?? s.entry.snippet;
      const rewriteT0 = Date.now();
      const rewrite = await runRewriteIngestWithMeta(s.entry, city, body);
      journey.addRewrite({
        model: rewrite.meta.model,
        prompt_tokens: rewrite.meta.prompt_tokens,
        cached_tokens: rewrite.meta.cached_tokens,
        completion_tokens: rewrite.meta.completion_tokens,
        cost_usd: rewrite.meta.cost_usd,
        ms: rewrite.meta.ms,
        length: rewrite.original_text.length
      });

      const enriched: FullResult = {
        ...s.full,
        original_language:
          rewrite.original_language || s.full.original_language,
        original_text: rewrite.original_text,
        english_text: rewrite.english_text
      };
      const id = await writeQueue({
        city,
        entry: s.entry,
        full: enriched,
        passedFilter: clearedThreshold,
        weather,
        rank: i + 1,
        journey
      });
      queuedIds.push(id);
    } catch (err) {
      console.warn(
        "[pipeline] rewrite/writeQueue failed:",
        (err as Error).message
      );
    }
  }

  const winner = toQueue[0];
  const winnerMin = Math.min(
    winner.full.score_specificity,
    winner.full.score_resonance
  );

  return {
    city_id: city.id,
    city_name: city.name,
    queued_id: queuedIds[0] ?? null,
    queued_ids: queuedIds,
    reason: `queued ${queuedIds.length} (rank 1 min=${intToFit(winnerMin)}, ${dedupedOut} dedup'd)`,
    entries_considered: rawEntries.length,
    entries_prefilter_pass: prefiltered.length,
    scores: {
      specificity: winner.full.score_specificity,
      resonance: winner.full.score_resonance,
      register: 0
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
      const result = await runIngest({ cityId: r.id, trigger: "cron" });
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

interface PrefilterMeta {
  model: string;
  pass: boolean;
  why: string;
  prompt_tokens: number;
  cached_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  ms: number;
}

async function runPrefilter(
  entries: FeedEntry[],
  city: City
): Promise<Array<{ entry: FeedEntry; meta: PrefilterMeta }>> {
  const kept: Array<{ entry: FeedEntry; meta: PrefilterMeta }> = [];

  for (const e of entries) {
    const t0 = Date.now();
    let pass = false;
    let why = "";
    let meta: PrefilterMeta = {
      model: PREFILTER_MODEL,
      pass: false,
      why: "",
      prompt_tokens: 0,
      cached_tokens: 0,
      completion_tokens: 0,
      cost_usd: 0,
      ms: 0
    };
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

      const usage = {
        model: PREFILTER_MODEL,
        promptTokens: resp.usage?.prompt_tokens ?? 0,
        cachedTokens: resp.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        completionTokens: resp.usage?.completion_tokens ?? 0
      };
      const cost = await recordSpend(usage, "ingest_prefilter", null);
      meta = {
        model: PREFILTER_MODEL,
        pass,
        why,
        prompt_tokens: usage.promptTokens,
        cached_tokens: usage.cachedTokens,
        completion_tokens: usage.completionTokens,
        cost_usd: cost,
        ms: Date.now() - t0
      };

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
      meta.ms = Date.now() - t0;
    }

    if (pass) kept.push({ entry: e, meta });
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
  /** Journey-style metadata captured at each stage of runFullPass. */
  _bodyMeta?: {
    method: "jsonld" | "readability" | "og" | "rss_fallback" | "error";
    chars: number;
    paywalled: boolean;
    ms: number;
    error?: string;
  };
  _scoreMeta?: {
    model: string;
    prompt_tokens: number;
    cached_tokens: number;
    completion_tokens: number;
    cost_usd: number;
    ms: number;
  };
}

async function runFullPass(
  entry: FeedEntry,
  city: City
): Promise<FullResult> {
  // Try to recover the real article body so the scorer and (later)
  // rewrite pass have substance to work with. Falls back to RSS
  // content/snippet if the site is paywalled or blocks scrapers.
  const bodyT0 = Date.now();
  const fetched = await fetchArticleBody(entry.link);
  const bodyMs = Date.now() - bodyT0;
  const rssBody =
    entry.content && entry.content.length > entry.snippet.length
      ? entry.content
      : entry.snippet;

  const bodyText = fetched.text && fetched.text.length > rssBody.length
    ? fetched.text
    : rssBody;
  const bodySource = fetched.text ? fetched.source : "rss";
  const paywalled = fetched.paywalled;
  const bodyMeta = {
    method: (fetched.text ? fetched.source : "rss_fallback") as
      "jsonld" | "readability" | "og" | "rss_fallback" | "error",
    chars: bodyText.length,
    paywalled,
    ms: bodyMs,
    error: fetched.error
  };

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
  const scoreT0 = Date.now();
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
  const parsed = JSON.parse(scoreRaw) as {
    c1: FitLevel;
    c2: FitLevel;
    rationale: string;
    local_hour: number;
    milk_price_local: number;
    eggs_price_local: number;
    milk_price_usd: number;
    eggs_price_usd: number;
  };

  // Map the 2-axis fit enum to the legacy integer columns so DB storage
  // + historic queries keep working. C1 -> score_specificity column,
  // C2 -> score_resonance column, score_register retired (null).
  const c1Int = fitToInt(parsed.c1);
  const c2Int = fitToInt(parsed.c2);
  const minFit = Math.min(c1Int, c2Int);
  const passed = minFit >= 1; // at least basic_fit on both axes

  const scoreUsage = {
    model: SCORE_MODEL,
    promptTokens: scoreResp.usage?.prompt_tokens ?? 0,
    cachedTokens: scoreResp.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    completionTokens: scoreResp.usage?.completion_tokens ?? 0
  };
  const scoreCost = await recordSpend(scoreUsage, "ingest_score", null);
  const scoreMeta = {
    model: SCORE_MODEL,
    prompt_tokens: scoreUsage.promptTokens,
    cached_tokens: scoreUsage.cachedTokens,
    completion_tokens: scoreUsage.completionTokens,
    cost_usd: scoreCost,
    ms: Date.now() - scoreT0
  };

  await logDecision({
    city_id: city.id,
    source_url: entry.link,
    source_title: entry.title,
    source_snippet: entry.snippet,
    stage: "score",
    verdict: passed ? "pass" : "fail",
    score_specificity: c1Int,
    score_resonance: c2Int,
    score_register: undefined,
    rationale: parsed.rationale
  });

  return {
    score_specificity: c1Int,
    score_resonance: c2Int,
    score_register: 0,
    rationale: parsed.rationale,
    passed,
    local_hour: parsed.local_hour,
    milk_price_local: parsed.milk_price_local,
    eggs_price_local: parsed.eggs_price_local,
    milk_price_usd: parsed.milk_price_usd,
    eggs_price_usd: parsed.eggs_price_usd,
    original_language: city.original_language ?? "en",
    original_text: "",
    english_text: "",
    _bodyText: bodyText,
    _bodySource: bodySource,
    _paywalled: paywalled,
    _bodyMeta: bodyMeta,
    _scoreMeta: scoreMeta
  };
}

/**
 * Rewrite pass. Separate API call, uses the more capable model
 * (gpt-4o by default). Called only for candidates that cleared the
 * score floor and are about to be queued.
 */
interface RewriteMeta {
  model: string;
  prompt_tokens: number;
  cached_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  ms: number;
}

async function runRewriteIngestWithMeta(
  entry: FeedEntry,
  city: City,
  bodyText: string
): Promise<{
  original_language: string;
  original_text: string;
  english_text: string;
  meta: RewriteMeta;
}> {
  const t0 = Date.now();
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

  const usage = {
    model: REWRITE_MODEL_INGEST,
    promptTokens: resp.usage?.prompt_tokens ?? 0,
    cachedTokens: resp.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    completionTokens: resp.usage?.completion_tokens ?? 0
  };
  const cost = await recordSpend(usage, "ingest_rewrite", null);

  // Force english_text empty when the city is anglophone — the
  // renderer uses that to decide whether to show the translation block.
  if ((city.original_language ?? "en") === "en") {
    out.english_text = "";
    out.original_language = "en";
  }
  return {
    ...out,
    meta: {
      model: REWRITE_MODEL_INGEST,
      prompt_tokens: usage.promptTokens,
      cached_tokens: usage.cachedTokens,
      completion_tokens: usage.completionTokens,
      cost_usd: cost,
      ms: Date.now() - t0
    }
  };
}

// --- writers --------------------------------------------------------

async function writeQueue(args: {
  city: City;
  entry: FeedEntry;
  full: FullResult;
  passedFilter: boolean;
  weather: string | null;
  rank: number;
  journey?: Journey;
}): Promise<string> {
  const { city, entry, full, passedFilter, weather, rank, journey } = args;
  const sql = requireSql();

  // Hero image. Try OG scrape of the source article first; if that
  // fails, search Unsplash with a (visual-noun + city) keyword extracted
  // from the rewrite; then watercolor map of the city; then picsum.
  const rewriteForQuery =
    full.english_text?.trim() || full.original_text?.trim() || "";
  const unsplashQueries = rewriteForQuery
    ? await extractPhotoQueries(rewriteForQuery, city.name)
    : [city.name, "street"];
  await ensurePhotoColumns();
  const photo = await resolveHeroImage(
    entry.link,
    `${city.id}-${entry.title}`,
    {
      lat: city.lat,
      lng: city.lng,
      unsplashQueries,
      storyText: rewriteForQuery
    }
  );
  const photoUrl = photo.url;

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

  // Photo metadata (source/query/attribution/cost) lives in separate
  // columns added on the fly; write it as a follow-up update so the
  // main insert stays readable.
  await sql`
    update moderation_queue set
      photo_source           = ${photo.source},
      photo_query            = ${photo.query},
      photo_attribution_url  = ${photo.attribution_url},
      photo_attribution_name = ${photo.attribution_name},
      photo_vision_score     = ${photo.vision_score},
      photo_vision_reason    = ${photo.vision_reason},
      photo_cost_usd         = ${photo.cost_usd},
      photo_journey          = ${JSON.stringify(photo.journey)}
    where id = ${id}
  `;

  // Fold photo info into the Journey trace + persist journey column.
  if (journey) {
    const photoMeta: JourneyPhoto = {
      source: photo.source,
      // Haiku is the only vision model in use; set whenever OG was judged.
      model: photo.vision_score != null ? "claude-haiku-4-5" : null,
      query: photo.query,
      vision_score: photo.vision_score,
      cost_usd: photo.cost_usd ?? 0,
      ms: 0, // ogImage doesn't currently expose per-resolve ms
      steps: photo.journey ?? []
    };
    journey.addPhoto(photoMeta);
    await sql`
      update moderation_queue set journey = ${JSON.stringify(journey.toJSON())}
      where id = ${id}
    `;
  }

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
