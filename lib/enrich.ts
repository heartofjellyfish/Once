/**
 * Story enrichment + publish.
 *
 * Input: the minimum 4-5 fields a human cares about.
 *   - headline (free text, any language)
 *   - cityText (free text — "Tianjin", "天津", "HCM City")
 *   - localDate (YYYY-MM-DD; the day the moment happened locally)
 *   - sourceUrl?  optional — for photo scraping + attribution link
 *   - photoUrl?   optional manual override; else we scrape + fallback
 *   - sourceName? optional display name for the attribution line
 *
 * Output: a fully-populated row inserted into `stories`, ready to
 * display. This hides all the "17 fields of guesswork" that the old
 * curate pipeline asked the AI to produce inline — here each field has
 * a deterministic source (city metadata, AI translation, weather API,
 * OG scraper, watercolor map fallback).
 */

import OpenAI from "openai";
import { requireSql } from "./db";
import { resolveCity, type ResolvedCity } from "./cityResolver";
import { resolveHeroImage } from "./ogImage";
import { extractPhotoKeyword } from "./photoKeywords";
import { fetchWeatherLabel } from "./weather";
import { assertBudget, recordSpend, type UsageBreakdown } from "./budget";
import { ONCE_HEADER } from "./prompts";

// Rewrite is the sentence readers actually read — spend on it. Prefilter
// and scoring stay on mini; this one gets the better model.
const MODEL = process.env.REWRITE_MODEL || "gpt-4o";

// ---------------------------------------------------------------- //
// Translation: produce { original_text, english_text } where        //
// original_text is written in the city's local language in Once's   //
// calm voice, and english_text is a faithful English rendering      //
// (empty when the city is anglophone).                              //
// ---------------------------------------------------------------- //

const REWRITE_SYSTEM = `${ONCE_HEADER}

YOUR JOB: rewrite the given source (headline + body) as one Once moment.

**ZOOM IN — don't paraphrase the framing.** The article's headline
is written to sell clicks; it may not be the Once moment. Scan the
body for the quietest, most specific, most human scene inside it —
often a minor character, an overheard detail, a one-line aside, a
specific time-and-place anchor the editor almost cut. If that
buried moment is more Once-shaped than the article's headline
framing, write about THAT moment, not the headline.

**LANGUAGE DISCIPLINE.** original_text MUST be in the city's
local_language — match it exactly. For an "en" city, original_text
is in ENGLISH and english_text is empty. For a "ja" city, Japanese.
For "vi", Vietnamese. Never default to Chinese or any other
language; match the city.

LANGUAGE HANDLING — follow exactly:
- original_text MUST be written in the city's local_language.
- english_text MUST be written in English.
- If the city's local_language is "en", english_text is "" (empty).
- Otherwise, english_text is a faithful translation of original_text.

Return JSON only.`;

const REWRITE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    original_text: { type: "string" },
    english_text: { type: "string" }
  },
  required: ["original_text", "english_text"]
} as const;

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set.");
  _client = new OpenAI({ apiKey: key });
  return _client;
}

interface RewriteResult {
  original_text: string;
  english_text: string;
}

async function rewriteInVoice(
  headline: string,
  body: string | null,
  city: ResolvedCity
): Promise<RewriteResult> {
  const userContent = [
    `CITY: ${city.name}, ${city.country}`,
    `LOCAL_LANGUAGE: ${city.original_language}`,
    "",
    "<article-content>",
    `HEADLINE: ${headline}`,
    body ? `\nBODY:\n${body}` : "",
    "</article-content>"
  ]
    .filter(Boolean)
    .join("\n");

  await assertBudget(0.02); // gpt-4o rewrite ~ 1-2¢ per call

  const resp = await client().chat.completions.create({
    model: MODEL,
    temperature: 0.45,
    max_tokens: 400,
    messages: [
      { role: "system", content: REWRITE_SYSTEM },
      { role: "user", content: userContent }
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "OnceRewrite", strict: true, schema: REWRITE_SCHEMA }
    }
  });

  const raw = resp.choices[0]?.message?.content;
  if (!raw) throw new Error("Rewrite returned empty content.");
  const parsed = JSON.parse(raw) as RewriteResult;

  const usage: UsageBreakdown = {
    model: MODEL,
    promptTokens: resp.usage?.prompt_tokens ?? 0,
    cachedTokens: resp.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    completionTokens: resp.usage?.completion_tokens ?? 0
  };
  await recordSpend(usage, "rewrite", null);

  if (city.original_language === "en") {
    // Force english_text blank when city is anglophone — the renderer
    // relies on this to decide whether to show the translation block.
    parsed.english_text = "";
  }

  return parsed;
}

// ---------------------------------------------------------------- //
// Publish.                                                          //
// ---------------------------------------------------------------- //

export interface EnrichInput {
  headline: string;
  body?: string;
  cityText: string;
  /** YYYY-MM-DD local date. If omitted, today UTC — good enough for display. */
  localDate?: string;
  sourceUrl?: string;
  sourceName?: string;
  /** Override photo (else we scrape OG / fall back to watercolor map). */
  photoUrl?: string;
  /**
   * If already rewritten in the city's local language (e.g. the moderation
   * queue's AI rewrite), pass it here and the rewrite step is skipped.
   */
  preRewrittenOriginal?: string;
  /** English translation of preRewrittenOriginal (or "" if city is anglophone). */
  preRewrittenEnglish?: string;
  /** ISO 639-1 of preRewrittenOriginal. Must match resolved city language to be reused. */
  preRewrittenLanguage?: string;
}

export interface EnrichResult {
  id: string;
  city: ResolvedCity;
  photo_url: string;
  weather_current: string | null;
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "item"
  );
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * Resolve the city, rewrite the headline in Once voice, enrich with
 * weather + photo, and insert into `stories`. Returns the new story id.
 *
 * The caller is responsible for revalidating / redirecting.
 */
export async function enrichAndPublish(input: EnrichInput): Promise<EnrichResult> {
  const headline = input.headline.trim();
  if (!headline) throw new Error("headline is required");
  if (!input.cityText?.trim()) throw new Error("city is required");

  // 1. City metadata.
  const city = await resolveCity(input.cityText);

  // 2. Rewrite in Once voice + translation — unless a valid rewrite was
  //    provided in the city's language (e.g. from the moderation queue).
  const canReusePreRewritten =
    !!input.preRewrittenOriginal &&
    input.preRewrittenOriginal.trim().length > 0 &&
    (city.original_language === "en" ||
      (input.preRewrittenEnglish !== undefined &&
        input.preRewrittenLanguage === city.original_language));

  const { original_text, english_text } = canReusePreRewritten
    ? {
        original_text: input.preRewrittenOriginal!.trim(),
        english_text:
          city.original_language === "en"
            ? ""
            : (input.preRewrittenEnglish ?? "").trim()
      }
    : await rewriteInVoice(headline, input.body ?? null, city);

  // 3. Enrich: weather + photo, in parallel.
  const seed = slug(city.name) + "-" + shortId();
  const rewriteForQuery = english_text?.trim() || original_text?.trim() || "";
  const unsplashQuery = rewriteForQuery
    ? await extractPhotoKeyword(rewriteForQuery, city.name)
    : city.name;
  const [weather, photoUrl] = await Promise.all([
    fetchWeatherLabel(city.lat, city.lng),
    input.photoUrl?.trim()
      ? Promise.resolve(input.photoUrl.trim())
      : resolveHeroImage(input.sourceUrl ?? "", seed, {
          lat: city.lat,
          lng: city.lng,
          unsplashQuery
        })
  ]);

  // 4. Pricing: prefer city-level cache, else warn (ResolvedCity should
  //    always provide these, but be defensive).
  const milkL = city.milk_price_local ?? 0;
  const eggsL = city.eggs_price_local ?? 0;
  const milkU = city.milk_price_usd ?? 0;
  const eggsU = city.eggs_price_usd ?? 0;

  // 5. Pin to current hour so homepage shows it immediately. Freshness
  //    rotation picks up again next hour.
  const selectedHour = Math.floor(Date.now() / (1000 * 60 * 60));

  const id = seed;

  const sql = requireSql();
  await sql`
    insert into stories (
      id, photo_url, country, region, city, timezone, local_hour,
      original_language, original_text, english_text,
      currency_code, currency_symbol,
      milk_price_local, eggs_price_local,
      milk_price_usd, eggs_price_usd,
      source_url, source_name,
      lat, lng,
      weather_current, location_summary, fetched_at,
      selected_hour
    ) values (
      ${id}, ${photoUrl}, ${city.country}, ${city.region},
      ${city.name}, ${city.timezone}, ${12},
      ${city.original_language}, ${original_text}, ${english_text},
      ${city.currency_code}, ${city.currency_symbol},
      ${milkL}, ${eggsL},
      ${milkU}, ${eggsU},
      ${input.sourceUrl || null}, ${input.sourceName || null},
      ${city.lat}, ${city.lng},
      ${weather}, ${city.location_summary}, now(),
      ${selectedHour}
    )
  `;

  // Clear any other pin on the same hour.
  await sql`
    update stories set selected_hour = null
    where selected_hour = ${selectedHour} and id <> ${id}
  `;

  return {
    id,
    city,
    photo_url: photoUrl,
    weather_current: weather
  };
}
