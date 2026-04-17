/**
 * City resolver.
 *
 * Input: a free-text city reference like "Tianjin", "天津", "HCM City",
 *        "Haidian, Beijing", "Antigua".
 * Output: a canonical `cities` row with ALL city-level metadata
 *         (timezone, lat/lng, currency, language, location_summary,
 *         approximate prices).
 *
 * Strategy:
 *   1. Normalize the input (strip, lowercase, NFKD).
 *   2. Look for an existing row by (name | aliases | id). If found, return.
 *   3. Otherwise ask gpt-4o-mini to geocode + summarise + estimate prices.
 *      Insert the row with is_active=false so it doesn't join the RSS
 *      rotation, but it's usable as a story reference.
 *   4. Return the new row + remember the input as an alias.
 *
 * This function is why /admin/compose only needs {headline, city, date}:
 * everything else is derived here.
 */

import OpenAI from "openai";
import { requireSql } from "./db";
import { assertBudget, recordSpend, type UsageBreakdown } from "./budget";

export interface ResolvedCity {
  id: string;
  name: string;
  country: string;
  region: string | null;
  timezone: string;
  lat: number;
  lng: number;
  currency_code: string;
  currency_symbol: string;
  original_language: string;
  location_summary: string | null;
  milk_price_local: number | null;
  eggs_price_local: number | null;
  milk_price_usd: number | null;
  eggs_price_usd: number | null;
}

const MODEL = "gpt-4o-mini";

let _client: OpenAI | null = null;
function client(): OpenAI {
  if (_client) return _client;
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set.");
  _client = new OpenAI({ apiKey: key });
  return _client;
}

/** Kebab-case id helper. ASCII-only. */
function slug(input: string): string {
  return (
    input
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "city"
  );
}

function normalize(s: string): string {
  return s.trim().toLowerCase().normalize("NFKD");
}

const SYSTEM_PROMPT = `You are a geocoder + cultural lookup for a small news app called Once.

Given a free-text city reference (in any language), return all the metadata needed to display a news moment from that city. Be precise and conservative — if you're uncertain about a field, still give your best guess rather than leaving it blank.

REQUIRED FIELDS:
- canonical_name: the city's commonly-known English name (e.g. "Tianjin" for "天津", "Ho Chi Minh City" for "HCM", "Antigua Guatemala" for "Antigua").
- country: English name of the country.
- region: province / state / prefecture / governorate name, in English. Use empty string if the city is a direct subdivision of the country with no meaningful region (e.g. a small city-state).
- timezone: canonical IANA timezone (e.g. "Asia/Shanghai", "Europe/Lisbon"). Must be valid in the tz database.
- lat, lng: approximate city centre, two decimal places is enough.
- currency_code: ISO 4217 (e.g. "CNY", "EUR").
- currency_symbol: the local currency symbol (e.g. "¥", "€", "₫"). If ambiguous, prefer the symbol used in everyday price tags locally.
- original_language: ISO 639-1 of the primary local language (e.g. "zh", "ja", "es", "pt"). If the city is fully anglophone, return "en".
- location_summary: ONE short, evocative sentence in Once's voice describing the city's scale and location. No superlatives. Examples: "a colonial mountain city in southern Mexico, ~275k people", "Japan's capital on Tokyo Bay, ~14 million people", "a district in northern China of ~1M people".
- milk_price_local: typical supermarket price of 1 litre of milk, in local currency. Reasonable estimate.
- eggs_price_local: typical price of 12 eggs, in local currency.
- milk_price_usd, eggs_price_usd: USD equivalents.

If the input looks too vague to identify (e.g. just "north"), still pick your single best interpretation rather than refusing — this is a soft display, not a record of fact.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    canonical_name: { type: "string" },
    country: { type: "string" },
    region: { type: "string" },
    timezone: { type: "string" },
    lat: { type: "number", minimum: -90, maximum: 90 },
    lng: { type: "number", minimum: -180, maximum: 180 },
    currency_code: { type: "string" },
    currency_symbol: { type: "string" },
    original_language: { type: "string" },
    location_summary: { type: "string" },
    milk_price_local: { type: "number", minimum: 0 },
    eggs_price_local: { type: "number", minimum: 0 },
    milk_price_usd: { type: "number", minimum: 0 },
    eggs_price_usd: { type: "number", minimum: 0 }
  },
  required: [
    "canonical_name",
    "country",
    "region",
    "timezone",
    "lat",
    "lng",
    "currency_code",
    "currency_symbol",
    "original_language",
    "location_summary",
    "milk_price_local",
    "eggs_price_local",
    "milk_price_usd",
    "eggs_price_usd"
  ]
} as const;

interface GeocodeResult {
  canonical_name: string;
  country: string;
  region: string;
  timezone: string;
  lat: number;
  lng: number;
  currency_code: string;
  currency_symbol: string;
  original_language: string;
  location_summary: string;
  milk_price_local: number;
  eggs_price_local: number;
  milk_price_usd: number;
  eggs_price_usd: number;
}

interface DbCityRow {
  id: string;
  name: string;
  country: string;
  region: string | null;
  timezone: string;
  lat: number;
  lng: number;
  currency_code: string | null;
  currency_symbol: string | null;
  original_language: string | null;
  location_summary: string | null;
  milk_price_local: number | null;
  eggs_price_local: number | null;
  milk_price_usd: number | null;
  eggs_price_usd: number | null;
  aliases: string[] | null;
}

function coerce(row: DbCityRow): ResolvedCity {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    region: row.region,
    timezone: row.timezone,
    lat: Number(row.lat),
    lng: Number(row.lng),
    currency_code: row.currency_code ?? "USD",
    currency_symbol: row.currency_symbol ?? "$",
    original_language: row.original_language ?? "en",
    location_summary: row.location_summary,
    milk_price_local: row.milk_price_local != null ? Number(row.milk_price_local) : null,
    eggs_price_local: row.eggs_price_local != null ? Number(row.eggs_price_local) : null,
    milk_price_usd: row.milk_price_usd != null ? Number(row.milk_price_usd) : null,
    eggs_price_usd: row.eggs_price_usd != null ? Number(row.eggs_price_usd) : null
  };
}

/**
 * Look up a city by free-text reference. If not found, geocode via AI,
 * insert a new cities row (is_active=false), and remember the input as
 * an alias. Returns the canonical row.
 */
export async function resolveCity(freeText: string): Promise<ResolvedCity> {
  const input = freeText.trim();
  if (!input) throw new Error("resolveCity: empty input");

  const norm = normalize(input);
  const sql = requireSql();

  // 1. Existing row? Match on id, name, or aliases (case-insensitive).
  const hits = (await sql`
    select id, name, country, region, timezone,
           lat::float8 as lat, lng::float8 as lng,
           currency_code, currency_symbol, original_language,
           location_summary,
           milk_price_local::float8  as milk_price_local,
           eggs_price_local::float8  as eggs_price_local,
           milk_price_usd::float8    as milk_price_usd,
           eggs_price_usd::float8    as eggs_price_usd,
           aliases
    from cities
    where lower(id) = ${norm}
       or lower(name) = ${norm}
       or exists (
         select 1 from unnest(aliases) a where lower(a) = ${norm}
       )
    limit 1
  `) as unknown as DbCityRow[];

  if (hits.length > 0) {
    const row = hits[0];
    // Remember this spelling as an alias if it's new.
    const existingAliases = new Set(
      [row.name, ...(row.aliases ?? [])].map(normalize)
    );
    if (!existingAliases.has(norm) && norm !== normalize(row.id)) {
      await sql`
        update cities
        set aliases = array_append(coalesce(aliases, '{}'), ${input})
        where id = ${row.id}
      `;
    }
    return coerce(row);
  }

  // 2. Geocode via AI.
  await assertBudget(0.003); // generous cap — this is a ~1-2k-token call

  const resp = await client().chat.completions.create({
    model: MODEL,
    temperature: 0.1,
    max_tokens: 400,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `CITY REFERENCE: ${input}` }
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "CityGeocode", strict: true, schema: SCHEMA }
    }
  });

  const raw = resp.choices[0]?.message?.content;
  if (!raw) throw new Error("City geocode returned empty content.");
  const geo = JSON.parse(raw) as GeocodeResult;

  const usage: UsageBreakdown = {
    model: MODEL,
    promptTokens: resp.usage?.prompt_tokens ?? 0,
    cachedTokens: resp.usage?.prompt_tokens_details?.cached_tokens ?? 0,
    completionTokens: resp.usage?.completion_tokens ?? 0
  };
  await recordSpend(usage, "city_resolve", null);

  // 3. Pick a unique id. Prefer slug(canonical_name), else append a shortid.
  const baseId = slug(geo.canonical_name);
  let id = baseId;
  const existingIds = (await sql`
    select id from cities where id = ${id} or id like ${`${baseId}-%`}
  `) as unknown as { id: string }[];
  if (existingIds.some((r) => r.id === id)) {
    id = `${baseId}-${Math.random().toString(36).slice(2, 6)}`;
  }

  // 4. Insert. is_active=false so the RSS cron doesn't poll it.
  await sql`
    insert into cities (
      id, name, country, region, timezone, lat, lng,
      currency_code, currency_symbol, original_language,
      location_summary,
      milk_price_local, eggs_price_local,
      milk_price_usd,   eggs_price_usd,
      prices_updated_at,
      aliases,
      rss_feeds, is_active
    ) values (
      ${id}, ${geo.canonical_name}, ${geo.country},
      ${geo.region || null}, ${geo.timezone},
      ${geo.lat}, ${geo.lng},
      ${geo.currency_code}, ${geo.currency_symbol},
      ${geo.original_language},
      ${geo.location_summary || null},
      ${geo.milk_price_local}, ${geo.eggs_price_local},
      ${geo.milk_price_usd},   ${geo.eggs_price_usd},
      now(),
      ${[input]},
      ${[]}, false
    )
    on conflict (id) do update set
      -- if someone inserted this id in a race, keep theirs and we'll
      -- return the existing row
      id = excluded.id
  `;

  // 5. Read back (guarantees we return the stored row).
  const read = (await sql`
    select id, name, country, region, timezone,
           lat::float8 as lat, lng::float8 as lng,
           currency_code, currency_symbol, original_language,
           location_summary,
           milk_price_local::float8  as milk_price_local,
           eggs_price_local::float8  as eggs_price_local,
           milk_price_usd::float8    as milk_price_usd,
           eggs_price_usd::float8    as eggs_price_usd,
           aliases
    from cities where id = ${id}
  `) as unknown as DbCityRow[];

  if (read.length === 0) throw new Error("City insert disappeared.");
  return coerce(read[0]);
}
