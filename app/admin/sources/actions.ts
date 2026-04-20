"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSql } from "@/lib/db";

// ------------------------------------------------------------------ //
// Curated city list — mirrors scripts/seed-cities.mjs.               //
// Keep both in sync when adding / removing cities.                   //
// ------------------------------------------------------------------ //
const SEED_CITIES = [
  // ─── East Asia ──────────────────────────────────────────────
  {
    id: "tokyo", name: "Tokyo", country: "Japan", region: "Tokyo Metropolis",
    timezone: "Asia/Tokyo", lat: 35.68, lng: 139.77,
    currency_code: "JPY", currency_symbol: "¥", original_language: "ja",
    location_summary: "Japan's capital on Tokyo Bay, ~14 million people",
    rss_feeds: ["https://soranews24.com/feed/", "https://www.nippon.com/en/feed/"]
  },
  {
    id: "seoul", name: "Seoul", country: "South Korea", region: "Seoul",
    timezone: "Asia/Seoul", lat: 37.57, lng: 126.98,
    currency_code: "KRW", currency_symbol: "₩", original_language: "ko",
    location_summary: "South Korea's capital on the Han River, ~10 million people",
    rss_feeds: ["https://thesoulofseoul.net/feed/"]
  },
  {
    id: "taipei", name: "Taipei", country: "Taiwan", region: "Taipei",
    timezone: "Asia/Taipei", lat: 25.03, lng: 121.57,
    currency_code: "TWD", currency_symbol: "NT$", original_language: "zh",
    location_summary: "Taiwan's capital in a subtropical basin, ~2.5 million people",
    rss_feeds: ["https://www.taipeitimes.com/xml/index.rss"]
  },
  {
    id: "beijing", name: "北京", country: "China", region: "Beijing",
    timezone: "Asia/Shanghai", lat: 39.90, lng: 116.41,
    currency_code: "CNY", currency_symbol: "¥", original_language: "zh",
    location_summary: "China's capital, ~21 million people; hutong alleys braided with ministries",
    rss_feeds: ["https://www.sixthtone.com/rss/news"]
  },
  {
    id: "tianjin", name: "天津", country: "China", region: "Tianjin",
    timezone: "Asia/Shanghai", lat: 39.13, lng: 117.20,
    currency_code: "CNY", currency_symbol: "¥", original_language: "zh",
    location_summary: "a major port city in northern China, ~15 million people",
    rss_feeds: ["https://www.sixthtone.com/rss/news"]
  },
  {
    id: "shanghai", name: "上海", country: "China", region: "Shanghai",
    timezone: "Asia/Shanghai", lat: 31.23, lng: 121.47,
    currency_code: "CNY", currency_symbol: "¥", original_language: "zh",
    location_summary: "China's eastern port city, ~25 million people; lane houses beside skyscrapers",
    rss_feeds: ["https://www.sixthtone.com/rss/news"]
  },
  // ─── Southeast Asia ─────────────────────────────────────────
  {
    id: "saigon", name: "Hồ Chí Minh City", country: "Vietnam", region: "Hồ Chí Minh City",
    timezone: "Asia/Ho_Chi_Minh", lat: 10.77, lng: 106.70,
    currency_code: "VND", currency_symbol: "₫", original_language: "vi",
    location_summary: "Vietnam's largest city on the Saigon River, ~9 million people",
    rss_feeds: ["https://saigoneer.com/?format=feed&type=rss"]
  },
  // ─── South Asia ─────────────────────────────────────────────
  {
    id: "mumbai", name: "Mumbai", country: "India", region: "Maharashtra",
    timezone: "Asia/Kolkata", lat: 19.08, lng: 72.88,
    currency_code: "INR", currency_symbol: "₹", original_language: "hi",
    location_summary: "India's Arabian Sea metropolis, ~21 million people; chawl life next to high-rises",
    rss_feeds: [
      "https://www.mid-day.com/rss/mumbai",
      "https://www.hindustantimes.com/feeds/rss/cities/mumbai-news/rssfeed.xml"
    ]
  },
  // ─── Middle East & West Asia ────────────────────────────────
  {
    id: "istanbul", name: "İstanbul", country: "Türkiye", region: "İstanbul",
    timezone: "Europe/Istanbul", lat: 41.01, lng: 28.97,
    currency_code: "TRY", currency_symbol: "₺", original_language: "tr",
    location_summary: "a transcontinental city straddling Europe and Asia, ~15 million people",
    rss_feeds: ["https://www.dailysabah.com/rssFeed/26"]
  },
  {
    id: "tehran", name: "Tehran", country: "Iran", region: "Tehran",
    timezone: "Asia/Tehran", lat: 35.69, lng: 51.39,
    currency_code: "IRR", currency_symbol: "﷼", original_language: "fa",
    location_summary: "Iran's capital in the foothills of the Alborz, ~9 million people",
    rss_feeds: ["https://www.tehrantimes.com/rss"]
  },
  // ─── Europe ─────────────────────────────────────────────────
  {
    id: "lisbon", name: "Lisboa", country: "Portugal", region: "Lisboa",
    timezone: "Europe/Lisbon", lat: 38.72, lng: -9.14,
    currency_code: "EUR", currency_symbol: "€", original_language: "pt",
    location_summary: "Portugal's capital on the Atlantic coast, ~550k people",
    rss_feeds: ["https://atlaslisboa.com/feed/"]
  },
  {
    id: "helsinki", name: "Helsinki", country: "Finland", region: "Uusimaa",
    timezone: "Europe/Helsinki", lat: 60.17, lng: 24.94,
    currency_code: "EUR", currency_symbol: "€", original_language: "fi",
    location_summary: "Finland's capital on the Gulf of Finland, ~660k people",
    rss_feeds: ["https://finland.fi/feed/"]
  },
  {
    id: "ljubljana", name: "Ljubljana", country: "Slovenia", region: "Osrednjeslovenska",
    timezone: "Europe/Ljubljana", lat: 46.05, lng: 14.51,
    currency_code: "EUR", currency_symbol: "€", original_language: "sl",
    location_summary: "Slovenia's small river-side capital in the Alps foothills, ~285k people",
    rss_feeds: ["https://sloveniatimes.com/rss"]
  },
  {
    id: "kyiv", name: "Київ", country: "Ukraine", region: "Kyiv",
    timezone: "Europe/Kyiv", lat: 50.45, lng: 30.52,
    currency_code: "UAH", currency_symbol: "₴", original_language: "uk",
    location_summary: "Ukraine's capital on the Dnipro, ~3 million people",
    rss_feeds: ["https://kyivindependent.com/rss/"]
  },
  {
    id: "reykjavik", name: "Reykjavík", country: "Iceland", region: "Höfuðborgarsvæðið",
    timezone: "Atlantic/Reykjavik", lat: 64.15, lng: -21.94,
    currency_code: "ISK", currency_symbol: "kr", original_language: "is",
    location_summary: "Iceland's capital on the North Atlantic, ~140k people; geologically restless",
    rss_feeds: ["https://www.icelandreview.com/feed/"]
  },
  // ─── North America ──────────────────────────────────────────
  {
    id: "new-york", name: "New York", country: "United States", region: "New York",
    timezone: "America/New_York", lat: 40.71, lng: -74.01,
    currency_code: "USD", currency_symbol: "$", original_language: "en",
    location_summary: "the east-coast metropolis at the mouth of the Hudson, ~8 million people",
    rss_feeds: [
      "https://hellgatenyc.com/rss",
      "https://gothamist.com/feed"
    ]
  },
  {
    id: "new-orleans", name: "New Orleans", country: "United States", region: "Louisiana",
    timezone: "America/Chicago", lat: 29.95, lng: -90.07,
    currency_code: "USD", currency_symbol: "$", original_language: "en",
    location_summary: "a Gulf Coast port city in the Mississippi delta, ~380k people",
    rss_feeds: ["https://www.nola.com/search/?f=rss&t=article&l=25&s=start_time&sd=desc"]
  },
  // ─── Latin America ──────────────────────────────────────────
  {
    id: "oaxaca", name: "Oaxaca de Juárez", country: "Mexico", region: "Oaxaca",
    timezone: "America/Mexico_City", lat: 17.06, lng: -96.72,
    currency_code: "MXN", currency_symbol: "$", original_language: "es",
    location_summary: "a colonial mountain city in southern Mexico, ~275k people",
    rss_feeds: ["https://theoaxacapost.com/feed/"]
  },
  {
    id: "valparaiso", name: "Valparaíso", country: "Chile", region: "Valparaíso",
    timezone: "America/Santiago", lat: -33.05, lng: -71.62,
    currency_code: "CLP", currency_symbol: "$", original_language: "es",
    location_summary: "a hillside port city on Chile's Pacific coast, ~300k people",
    rss_feeds: ["https://orgulloporteno.cl/feed/"]
  },
  {
    id: "antigua", name: "Antigua Guatemala", country: "Guatemala", region: "Sacatepéquez",
    timezone: "America/Guatemala", lat: 14.56, lng: -90.73,
    currency_code: "GTQ", currency_symbol: "Q", original_language: "es",
    location_summary: "a colonial highland town at the foot of three volcanoes, ~45k people",
    rss_feeds: ["https://quepasa.gt/feed/"]
  },
  // ─── Africa ─────────────────────────────────────────────────
  {
    id: "lagos", name: "Lagos", country: "Nigeria", region: "Lagos",
    timezone: "Africa/Lagos", lat: 6.45, lng: 3.39,
    currency_code: "NGN", currency_symbol: "₦", original_language: "en",
    location_summary: "Nigeria's commercial megacity on the Gulf of Guinea, ~15+ million people",
    rss_feeds: [
      "https://www.pulse.ng/rss",
      "https://guardian.ng/feed/"
    ]
  },
  {
    id: "nairobi", name: "Nairobi", country: "Kenya", region: "Nairobi",
    timezone: "Africa/Nairobi", lat: -1.29, lng: 36.82,
    currency_code: "KES", currency_symbol: "KSh", original_language: "en",
    location_summary: "Kenya's highland capital, ~4.4 million people; matatu routes and acacia skylines",
    rss_feeds: [
      "https://nation.africa/kenya/rss",
      "https://www.the-star.co.ke/rss"
    ]
  },
  {
    id: "cape-town", name: "Cape Town", country: "South Africa", region: "Western Cape",
    timezone: "Africa/Johannesburg", lat: -33.92, lng: 18.42,
    currency_code: "ZAR", currency_symbol: "R", original_language: "en",
    location_summary: "a port city below Table Mountain, ~4.6 million people",
    rss_feeds: ["https://www.dailymaverick.co.za/dmrss/"]
  },
  // ─── Oceania ────────────────────────────────────────────────
  {
    id: "melbourne", name: "Melbourne", country: "Australia", region: "Victoria",
    timezone: "Australia/Melbourne", lat: -37.81, lng: 144.96,
    currency_code: "AUD", currency_symbol: "A$", original_language: "en",
    location_summary: "Australia's southern metropolis on Port Phillip Bay, ~5 million people",
    rss_feeds: ["https://www.theage.com.au/rss/victoria.xml"]
  }
] as const;

/**
 * Upsert all curated cities and deactivate any that are no longer in
 * the list. Mirrors scripts/seed-cities.mjs but callable from the
 * admin UI without touching the terminal.
 */
export async function seedCitiesAction(): Promise<void> {
  const sql = requireSql();

  // Apply idempotent schema migrations inline so the user doesn't need
  // terminal access. Safe to run every time.
  await sql`alter table cities add column if not exists milk_price_local numeric(14,4)`;
  await sql`alter table cities add column if not exists eggs_price_local numeric(14,4)`;
  await sql`alter table cities add column if not exists milk_price_usd   numeric(10,4)`;
  await sql`alter table cities add column if not exists eggs_price_usd   numeric(10,4)`;
  await sql`alter table cities add column if not exists prices_updated_at timestamptz`;
  await sql`alter table cities add column if not exists aliases text[] not null default '{}'`;

  // Queue: rank within ingest cycle + city_id for grouping.
  await sql`alter table moderation_queue add column if not exists rank smallint default 1`;
  await sql`alter table moderation_queue add column if not exists city_id text`;
  await sql`create index if not exists queue_pending_city_rank_idx on moderation_queue (city_id, rank, created_at desc) where status = 'pending'`;

  // Dedup table for ingest pipeline.
  await sql`
    create table if not exists seen_urls (
      url_hash       text primary key,
      content_hash   text,
      source_host    text,
      first_seen_at  timestamptz not null default now()
    )
  `;
  await sql`create index if not exists seen_urls_content_idx on seen_urls (content_hash) where content_hash is not null`;
  await sql`create index if not exists seen_urls_first_seen_idx on seen_urls (first_seen_at)`;
  // Prune entries older than 30 days so the dedup table stays bounded.
  await sql`delete from seen_urls where first_seen_at < now() - interval '30 days'`;

  const wantedIds = SEED_CITIES.map((c) => c.id);

  for (const c of SEED_CITIES) {
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
        ${c.location_summary ?? null}, ${c.rss_feeds as unknown as string[]}, true
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
  }

  // Deactivate removed cities (preserves rows + history).
  await sql`
    update cities
    set is_active = false
    where id <> all(${wantedIds})
      and is_active = true
  `;

  revalidatePath("/admin/sources");
  redirect("/admin/sources?seed_ok=1");
}

/**
 * Replace a city's rss_feeds array. `feeds_text` is newline-separated URLs
 * (user-editable textarea). Lines starting with `#` are treated as comments
 * and dropped. Empty lines dropped.
 */
export async function updateCityFeeds(formData: FormData): Promise<void> {
  const cityId = String(formData.get("city_id") ?? "").trim();
  const feedsText = String(formData.get("feeds") ?? "");

  if (!cityId) {
    redirect("/admin/sources?err=missing-city-id");
  }

  const feeds = feedsText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"))
    .map((l) => (l.startsWith("http") ? l : `https://${l}`));

  const sql = requireSql();
  await sql`
    update cities set rss_feeds = ${feeds} where id = ${cityId}
  `;

  revalidatePath("/admin/sources");
  redirect(`/admin/sources?updated=${encodeURIComponent(cityId)}#${cityId}`);
}

/** Toggle is_active so pickCity() skips this city. */
export async function toggleCityActive(formData: FormData): Promise<void> {
  const cityId = String(formData.get("city_id") ?? "").trim();
  if (!cityId) redirect("/admin/sources");

  const sql = requireSql();
  await sql`
    update cities set is_active = not is_active where id = ${cityId}
  `;
  revalidatePath("/admin/sources");
  redirect(`/admin/sources#${cityId}`);
}
