import OpenAI from "openai";
import {
  assertBudget,
  estimateCost,
  recordSpend,
  type UsageBreakdown
} from "./budget";

/**
 * AI-assisted curation.
 *
 * Given raw source text (plus optional hints), ask gpt-4o-mini to:
 *   1. Decide whether the moment fits Once's aesthetic.
 *   2. If yes, render it in the location's local language in Once's voice.
 *   3. Produce all the fields a Story needs, except photo_url.
 *
 * The system prompt and JSON schema are invariant per call, so OpenAI's
 * automatic prompt caching kicks in after the first call — free.
 */

const MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `You are the curator for "Once", a quiet web application that shows ONE small moment from somewhere in the world at a time.

Your job: given raw source text, decide whether it fits Once's aesthetic and, if so, re-render it in the LOCATION'S LOCAL LANGUAGE in Once's calm voice.

ONCE'S AESTHETIC — small, local, ordinary, non-dramatic.
GOOD: a bakery ran out of bread; a bus was twelve minutes late; a cat fell asleep in the shop's till; the funicular stopped for twenty minutes because of a jammed umbrella.
BAD: politics, elections, protests, policy; war, violence, crime, death; celebrity/influencer news; stocks, crypto, interest rates, inflation data; hurricanes, floods, earthquakes; anything that feels like a headline or "breaking" news.
VOICE: calm, specific, slightly understated. One to two sentences. No exclamation marks. Mention street or neighbourhood names the locals would use.

WHAT TO OUTPUT:
- passed_filter: true only if the content is small/ordinary/non-dramatic per above.
- rationale: ONE short sentence explaining your decision (for the editor to read).
- If passed_filter=false, you may leave other fields blank / 0 / "" — they will be discarded.
- If passed_filter=true:
  - city, region, country: the precise location.
  - timezone: the IANA timezone for that city (e.g. "Europe/Lisbon", "Asia/Tokyo", "America/Mexico_City").
  - local_hour (0-23): the hour of day the moment occurred. Infer from phrasing — "this morning" ≈ 9, "before noon" ≈ 11, "this afternoon" ≈ 14–15, "this evening" ≈ 18. If an explicit clock time is given, use it. If truly unclear, use 12.
  - lat, lng: the approximate latitude and longitude of the city in degrees (-90..90 / -180..180). Two decimals is enough precision.
  - original_language: ISO 639-1 code of the location's local language (e.g. "pt" for Portugal, "ja" for Japan, "en" for Ireland).
  - original_text: 1–2 calm sentences, IN THE LOCAL LANGUAGE, in Once's voice. This is the most important field. Never leave it in English when the location speaks another language.
  - english_text: faithful English translation of original_text. If original_language is "en", set english_text to "" (empty string).
  - currency_code (ISO 4217) and currency_symbol.
  - milk_price_local, eggs_price_local: approximate retail prices (1 litre milk, 12 eggs) in local currency today. Use 0 if you genuinely don't know.
  - milk_price_usd, eggs_price_usd: the USD equivalents. Use 0 if you don't know.

Be conservative on passed_filter. When in doubt, filter out. Once would rather show fewer, quieter moments than too many.`;

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
