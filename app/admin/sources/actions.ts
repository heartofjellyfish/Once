"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSql } from "@/lib/db";

// ------------------------------------------------------------------ //
// Curated city list — mirrors scripts/seed-cities.mjs.               //
// Keep both in sync when adding / removing cities.                   //
// ------------------------------------------------------------------ //
const SEED_CITIES = [
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
    id: "saigon", name: "Hồ Chí Minh City", country: "Vietnam", region: "Hồ Chí Minh City",
    timezone: "Asia/Ho_Chi_Minh", lat: 10.77, lng: 106.70,
    currency_code: "VND", currency_symbol: "₫", original_language: "vi",
    location_summary: "Vietnam's largest city on the Saigon River, ~9 million people",
    rss_feeds: ["https://saigoneer.com/?format=feed&type=rss"]
  },
  {
    id: "lisbon", name: "Lisboa", country: "Portugal", region: "Lisboa",
    timezone: "Europe/Lisbon", lat: 38.72, lng: -9.14,
    currency_code: "EUR", currency_symbol: "€", original_language: "pt",
    location_summary: "Portugal's capital on the Atlantic coast, ~550k people",
    rss_feeds: ["https://atlaslisboa.com/feed/"]
  },
  {
    id: "istanbul", name: "İstanbul", country: "Türkiye", region: "İstanbul",
    timezone: "Europe/Istanbul", lat: 41.01, lng: 28.97,
    currency_code: "TRY", currency_symbol: "₺", original_language: "tr",
    location_summary: "a transcontinental city straddling Europe and Asia, ~15 million people",
    rss_feeds: ["https://www.dailysabah.com/rssFeed/26"]
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
  }
] as const;

/**
 * Upsert all curated cities and deactivate any that are no longer in
 * the list. Mirrors scripts/seed-cities.mjs but callable from the
 * admin UI without touching the terminal.
 */
export async function seedCitiesAction(): Promise<void> {
  const sql = requireSql();
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
