import OpenAI from "openai";
import {
  assertBudget,
  estimateCost,
  recordSpend,
  type UsageBreakdown
} from "./budget";
import { ONCE_HEADER } from "./prompts";

/**
 * AI-assisted curation for the /admin/ingest paste-a-URL flow.
 *
 * Given raw source text (plus optional hints), ask gpt-4o-mini to:
 *   1. Decide whether the moment fits Once.
 *   2. If yes, render it in the location's local language in Once's voice.
 *   3. Produce all the fields a Story needs, except photo_url.
 *
 * Uses the shared ONCE_HEADER so rule changes move every stage together.
 */

const MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `${ONCE_HEADER}

YOUR JOB: the editor has pasted raw source text. Decide whether it's a
Once moment; if so, rewrite it in the city's local language in Once's
voice, and fill in the other fields.

WHAT TO OUTPUT:
- passed_filter: true if the content is a Once-shaped moment — either
  (a) a still scene with a specific human/place/object hook, OR
  (b) a tight chain of small acts around one object/person that
  carries the hidden B-current (see the third contrast pair above).
  When in doubt, PASS — a human editor reviews every queued item and
  will catch false positives.
- rationale: ONE short sentence explaining your decision (for the editor).
- If passed_filter=false: other fields can be blank / 0 / "" — discarded.
- If passed_filter=true:
  - city, region, country: the precise location.
  - timezone: IANA (e.g. "Europe/Lisbon", "Asia/Tokyo", "America/Mexico_City").
  - local_hour (0-23): infer from phrasing ("this morning"≈9, "afternoon"≈14).
    12 if truly unknown.
  - lat, lng: approximate city centre, 2 decimals is enough.
  - original_language: ISO 639-1 (e.g. "pt", "ja", "en").
  - original_text: 1–2 calm sentences IN THE LOCAL LANGUAGE, in Once's
    voice. Follow every rule above. Keep proper nouns if present in the
    source; never invent them. NEVER in English when the city isn't.
  - english_text: faithful English translation. "" if original is "en".
  - currency_code (ISO 4217) and currency_symbol.
  - milk_price_local, eggs_price_local: current approximate retail
    (1 litre milk, 12 eggs). 0 if you genuinely don't know.
  - milk_price_usd, eggs_price_usd: USD equivalents. 0 if unknown.`;

/** JSON Schema for Structured Outputs. Every field required; null allowed via union. */
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    passed_filter: { type: "boolean" },
    rationale: { type: "string" },
    country: { type: "string" },
    region: { type: ["string", "null"] },
    city: { type: "string" },
    timezone: { type: "string" },
    local_hour: { type: "integer", minimum: 0, maximum: 23 },
    lat: { type: "number", minimum: -90, maximum: 90 },
    lng: { type: "number", minimum: -180, maximum: 180 },
    original_language: { type: "string" },
    original_text: { type: "string" },
    english_text: { type: "string" },
    currency_code: { type: "string" },
    currency_symbol: { type: "string" },
    milk_price_local: { type: "number", minimum: 0 },
    eggs_price_local: { type: "number", minimum: 0 },
    milk_price_usd: { type: "number", minimum: 0 },
    eggs_price_usd: { type: "number", minimum: 0 }
  },
  required: [
    "passed_filter",
    "rationale",
    "country",
    "region",
    "city",
    "timezone",
    "local_hour",
    "lat",
    "lng",
    "original_language",
    "original_text",
    "english_text",
    "currency_code",
    "currency_symbol",
    "milk_price_local",
    "eggs_price_local",
    "milk_price_usd",
    "eggs_price_usd"
  ]
} as const;

export interface CurateInput {
  sourceText: string;
  cityHint?: string;
  sourceUrl?: string;
}

export interface CurateResult {
  passed_filter: boolean;
  rationale: string;
  country: string;
  region: string | null;
  city: string;
  timezone: string;
  local_hour: number;
  lat: number;
  lng: number;
  original_language: string;
  original_text: string;
  english_text: string;
  currency_code: string;
  currency_symbol: string;
  milk_price_local: number;
  eggs_price_local: number;
  milk_price_usd: number;
  eggs_price_usd: number;
}

export interface CurateOutput {
  result: CurateResult;
  cost_usd: number;
  model: string;
}

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set.");
  _client = new OpenAI({ apiKey: key });
  return _client;
}

/**
 * Rough token-cost estimate for budget pre-check. Uses ~4 chars/token heuristic.
 * System prompt is assumed fully cached on warm path.
 */
function preEstimateCost(userText: string): number {
  const systemTokens = Math.ceil(SYSTEM_PROMPT.length / 4); // ~700 tokens
  const userTokens = Math.ceil(userText.length / 4);
  const outputTokens = 350; // typical structured response
  const usage: UsageBreakdown = {
    model: MODEL,
    promptTokens: systemTokens + userTokens,
    cachedTokens: systemTokens, // assume warm
    completionTokens: outputTokens
  };
  return estimateCost(usage);
}

/** Estimate the cost of curating a given source text — used by the admin UI. */
export function estimateCurateCost(sourceText: string): number {
  return preEstimateCost(sourceText);
}

export async function curate(
  input: CurateInput,
  queueId: string | null = null
): Promise<CurateOutput> {
  const userText = [
    `SOURCE TEXT:\n${input.sourceText}`,
    input.cityHint ? `CITY HINT: ${input.cityHint}` : "CITY HINT: (none)",
    input.sourceUrl ? `SOURCE URL: ${input.sourceUrl}` : "SOURCE URL: (none)"
  ].join("\n\n");

  // Budget pre-check: refuse before spending if weekly cap would be crossed.
  await assertBudget(preEstimateCost(userText));

  const completion = await client().chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userText }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "OnceCandidate",
        strict: true,
        schema: OUTPUT_SCHEMA
      }
    },
    temperature: 0.4,
    max_tokens: 800
  });

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error("OpenAI returned empty content.");

  const result = JSON.parse(raw) as CurateResult;

  const usage: UsageBreakdown = {
    model: MODEL,
    promptTokens: completion.usage?.prompt_tokens ?? 0,
    cachedTokens:
      completion.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    completionTokens: completion.usage?.completion_tokens ?? 0
  };

  const cost = await recordSpend(usage, "curate", queueId);

  return { result, cost_usd: cost, model: MODEL };
}
