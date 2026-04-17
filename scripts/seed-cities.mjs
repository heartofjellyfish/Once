#!/usr/bin/env node
// Seeds the `cities` table — 11 curated Once-style cities, including
// two deliberately small ones (Antigua Guatemala ~45k, Ljubljana ~285k).
//
// All feeds are "soft news / human-interest / cultural" publications
// hand-picked to match the SoraNews24 benchmark: quirky, translated,
// hyperlocal. Political/economic-heavy feeds and Reddit are intentionally
// excluded.
//
// Idempotent: uses ON CONFLICT DO UPDATE so re-running updates the feed
// list and location summary but preserves last_ingest_at. Cities not
// in this list are deactivated (is_active=false) rather than deleted,
// so any stories that were already published remain attributable.
//
// Usage: DATABASE_URL=postgres://... node scripts/seed-cities.mjs

import { neon } from "@neondatabase/serverless";

const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL;

if (!url) {
  console.error("No DATABASE_URL / POSTGRES_URL is set.");
  process.exit(1);
}

const sql = neon(url);

const cities = [
  {
    id: "tokyo",
    name: "Tokyo",
    country: "Japan",
    region: "Tokyo Metropolis",
    timezone: "Asia/Tokyo",
    lat: 35.68,
    lng: 139.77,
    currency_code: "JPY",
    currency_symbol: "¥",
    original_language: "ja",
    location_summary: "Japan's capital on Tokyo Bay, ~14 million people",
    // SoraNews24 covers the uncanny-little-thing-from-Japan beat that
    // is the Once benchmark. Nippon.com is a quieter second — cultural
    // curiosities, always in English.
    rss_feeds: [
      "https://soranews24.com/feed/",
      "https://www.nippon.com/en/feed/"
    ]
  },
  {
    id: "seoul",
    name: "Seoul",
    country: "South Korea",
    region: "Seoul",
    timezone: "Asia/Seoul",
    lat: 37.57,
    lng: 126.98,
    currency_code: "KRW",
    currency_symbol: "₩",
    original_language: "ko",
    location_summary: "South Korea's capital on the Han River, ~10 million people",
    // "The Soul of Seoul": hyperlocal cultural storytelling.
    rss_feeds: ["https://thesoulofseoul.net/feed/"]
  },
  {
    id: "taipei",
    name: "Taipei",
    country: "Taiwan",
    region: "Taipei",
    timezone: "Asia/Taipei",
    lat: 25.03,
    lng: 121.57,
    currency_code: "TWD",
    currency_symbol: "NT$",
    original_language: "zh",
    location_summary: "Taiwan's capital in a subtropical basin, ~2.5 million people",
    // Taipei Times mixes society, culture, and politics — prefilter will
    // drop the politics.
    rss_feeds: ["https://www.taipeitimes.com/xml/index.rss"]
  },
  {
    id: "saigon",
    name: "Hồ Chí Minh City",
    country: "Vietnam",
    region: "Hồ Chí Minh City",
    timezone: "Asia/Ho_Chi_Minh",
    lat: 10.77,
    lng: 106.70,
    currency_code: "VND",
    currency_symbol: "₫",
    original_language: "vi",
    location_summary: "Vietnam's largest city on the Saigon River, ~9 million people",
    // Saigoneer: the closest Vietnam equivalent of SoraNews24 —
    // hẻm-gem profiles, unexpected-history stories, kindness anecdotes.
    rss_feeds: ["https://saigoneer.com/?format=feed&type=rss"]
  },
  {
    id: "lisbon",
    name: "Lisboa",
    country: "Portugal",
    region: "Lisboa",
    timezone: "Europe/Lisbon",
    lat: 38.72,
    lng: -9.14,
    currency_code: "EUR",
    currency_symbol: "€",
    original_language: "pt",
    location_summary: "Portugal's capital on the Atlantic coast, ~550k people",
    // Atlas Lisboa: neighbourhood profiles, small bar openings, poet
    // society meetups. Human-scale Lisbon.
    rss_feeds: ["https://atlaslisboa.com/feed/"]
  },
  {
    id: "istanbul",
    name: "İstanbul",
    country: "Türkiye",
    region: "İstanbul",
    timezone: "Europe/Istanbul",
    lat: 41.01,
    lng: 28.97,
    currency_code: "TRY",
    currency_symbol: "₺",
    original_language: "tr",
    location_summary: "a transcontinental city straddling Europe and Asia, ~15 million people",
    // Daily Sabah Life: archaeology, animals, arts. Politics siloed
    // to their other feeds, so this one stays on-tone.
    rss_feeds: ["https://www.dailysabah.com/rssFeed/26"]
  },
  {
    id: "helsinki",
    name: "Helsinki",
    country: "Finland",
    region: "Uusimaa",
    timezone: "Europe/Helsinki",
    lat: 60.17,
    lng: 24.94,
    currency_code: "EUR",
    currency_symbol: "€",
    original_language: "fi",
    location_summary: "Finland's capital on the Gulf of Finland, ~660k people",
    // thisisFINLAND: Easter witches, Venice Biennale artists, Midsummer
    // traditions. Culture-first.
    rss_feeds: ["https://finland.fi/feed/"]
  },
  {
    id: "ljubljana",
    name: "Ljubljana",
    country: "Slovenia",
    region: "Osrednjeslovenska",
    timezone: "Europe/Ljubljana",
    lat: 46.05,
    lng: 14.51,
    currency_code: "EUR",
    currency_symbol: "€",
    original_language: "sl",
    location_summary: "Slovenia's small river-side capital in the Alps foothills, ~285k people",
    // Slovenia Times: the country is small enough that the national
    // English feed reads as hyperlocal Ljubljana.
    rss_feeds: ["https://sloveniatimes.com/rss"]
  },
  {
    id: "oaxaca",
    name: "Oaxaca de Juárez",
    country: "Mexico",
    region: "Oaxaca",
    timezone: "America/Mexico_City",
    lat: 17.06,
    lng: -96.72,
    currency_code: "MXN",
    currency_symbol: "$",
    original_language: "es",
    location_summary: "a colonial mountain city in southern Mexico, ~275k people",
    // The Oaxaca Post: coast life, markets, local characters in English.
    rss_feeds: ["https://theoaxacapost.com/feed/"]
  },
  {
    id: "valparaiso",
    name: "Valparaíso",
    country: "Chile",
    region: "Valparaíso",
    timezone: "America/Santiago",
    lat: -33.05,
    lng: -71.62,
    currency_code: "CLP",
    currency_symbol: "$",
    original_language: "es",
    location_summary: "a hillside port city on Chile's Pacific coast, ~300k people",
    // Orgullo Porteño: "rescuing the history of Valparaíso" — cinema
    // festivals, rap launches, book presentations. Quirky and cultural.
    rss_feeds: ["https://orgulloporteno.cl/feed/"]
  },
  {
    id: "antigua",
    name: "Antigua Guatemala",
    country: "Guatemala",
    region: "Sacatepéquez",
    timezone: "America/Guatemala",
    lat: 14.56,
    lng: -90.73,
    currency_code: "GTQ",
    currency_symbol: "Q",
    original_language: "es",
    location_summary: "a colonial highland town at the foot of three volcanoes, ~45k people",
    // Qué Pasa Magazine: the smallest city in the rotation. English
    // heritage/culture coverage — will need moderation to skip the
    // real-estate and restaurant promos.
    rss_feeds: ["https://quepasa.gt/feed/"]
  }
];

const wantedIds = new Set(cities.map((c) => c.id));

let upserted = 0;
for (const c of cities) {
  await sql`
    insert into cities (
      id, name, country, region, timezone, lat, lng,
      currency_code, currency_symbol, original_language,
      location_summary, rss_feeds, is_active
    ) values (
      ${c.id}, ${c.name}, ${c.country}, ${c.region ?? null},
      ${c.timezone}, ${c.lat}, ${c.lng},
      ${c.currency_code ?? null}, ${c.currency_symbol ?? null},
      ${c.original_language ?? null},
      ${c.location_summary ?? null}, ${c.rss_feeds}, true
    )
    on conflict (id) do update set
      name              = excluded.name,
      country           = excluded.country,
      region            = excluded.region,
      timezone          = excluded.timezone,
      lat               = excluded.lat,
      lng               = excluded.lng,
      currency_code     = excluded.currency_code,
      currency_symbol   = excluded.currency_symbol,
      original_language = excluded.original_language,
      location_summary  = excluded.location_summary,
      rss_feeds         = excluded.rss_feeds,
      is_active         = excluded.is_active
  `;
  upserted++;
}

// Deactivate any city that's no longer in the curated list. We keep the
// row (and its history) around, just skip it in the pipeline.
const idsArray = Array.from(wantedIds);
const deactivated = await sql`
  update cities
  set is_active = false
  where id <> all(${idsArray})
    and is_active = true
  returning id
`;

console.log(`✓ cities seeded: ${upserted}`);
if (deactivated.length > 0) {
  console.log(
    `  deactivated ${deactivated.length}: ${deactivated.map((r) => r.id).join(", ")}`
  );
}
