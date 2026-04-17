#!/usr/bin/env node
// Seeds the `cities` table with the 10 MVP cities + their RSS feeds.
//
// Idempotent: uses ON CONFLICT DO UPDATE so re-running updates the feed
// list and location summary but preserves last_ingest_at.
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

// 10 MVP cities. Mix of language, continent, activity.
// TODO later: add smaller towns (per user — currently all big cities).
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
    location_summary: "the capital of Japan, ~14 million people",
    rss_feeds: [
      "https://www.reddit.com/r/Tokyo/new/.rss",
      "https://www.japantimes.co.jp/feed/"
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
    location_summary: "the capital of South Korea, ~10 million people",
    rss_feeds: [
      "https://www.reddit.com/r/seoul/new/.rss",
      "https://www.koreaherald.com/rss/newsAll"
    ]
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
    location_summary: "Portugal's capital on the Atlantic, ~550k people",
    rss_feeds: [
      "https://www.reddit.com/r/lisboa/new/.rss",
      "https://feeds.feedburner.com/PublicoRSS"
    ]
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
    rss_feeds: [
      "https://www.reddit.com/r/istanbul/new/.rss",
      "https://www.hurriyetdailynews.com/rss"
    ]
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
    rss_feeds: [
      "https://www.reddit.com/r/Helsinki/new/.rss",
      "https://feeds.yle.fi/uutiset/v1/majorHeadlines/YLE_UUTISET.rss"
    ]
  },
  {
    id: "kyoto",
    name: "Kyoto",
    country: "Japan",
    region: "Kyoto Prefecture",
    timezone: "Asia/Tokyo",
    lat: 35.01,
    lng: 135.77,
    currency_code: "JPY",
    currency_symbol: "¥",
    original_language: "ja",
    location_summary: "former capital of Japan, ~1.5 million people",
    rss_feeds: [
      "https://www.reddit.com/r/Kyoto/new/.rss"
    ]
  },
  {
    id: "sarajevo",
    name: "Sarajevo",
    country: "Bosnia and Herzegovina",
    region: "Sarajevo Canton",
    timezone: "Europe/Sarajevo",
    lat: 43.86,
    lng: 18.41,
    currency_code: "BAM",
    currency_symbol: "KM",
    original_language: "bs",
    location_summary: "Bosnia's capital in a Dinaric Alps valley, ~275k people",
    rss_feeds: [
      "https://www.reddit.com/r/sarajevo/new/.rss",
      "https://www.klix.ba/rss/pocetna"
    ]
  },
  {
    id: "kyiv",
    name: "Kyiv",
    country: "Ukraine",
    region: "Kyiv",
    timezone: "Europe/Kyiv",
    lat: 50.45,
    lng: 30.52,
    currency_code: "UAH",
    currency_symbol: "₴",
    original_language: "uk",
    location_summary: "Ukraine's capital on the Dnipro River, ~3 million people",
    rss_feeds: [
      "https://www.reddit.com/r/Kyiv/new/.rss",
      "https://kyivindependent.com/rss/"
    ]
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
    location_summary: "a colonial city in southern Mexico, ~275k people",
    rss_feeds: [
      "https://www.reddit.com/r/oaxaca/new/.rss"
    ]
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
    rss_feeds: [
      "https://www.reddit.com/r/taipei/new/.rss",
      "https://focustaiwan.tw/RSS/news.xml"
    ]
  }
];

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

console.log(`✓ cities seeded: ${upserted}`);
