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
    rss_feeds: [
      "https://thesoulofseoul.net/feed/",
      "https://restofworld.org/feed/"
    ]
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
    rss_feeds: [
      "https://www.sixthtone.com/rss",
      "https://www.whatsonweibo.com/feed/",
      "https://radii.co/feed",
      "https://www.thatsmags.com/rss",
      "https://restofworld.org/feed/"
    ]
  },
  {
    id: "tianjin", name: "天津", country: "China", region: "Tianjin",
    timezone: "Asia/Shanghai", lat: 39.13, lng: 117.20,
    currency_code: "CNY", currency_symbol: "¥", original_language: "zh",
    location_summary: "a major port city in northern China, ~15 million people",
    rss_feeds: [
      "https://www.sixthtone.com/rss",
      "https://www.whatsonweibo.com/feed/",
      "https://radii.co/feed",
      "https://www.thatsmags.com/rss",
      "https://restofworld.org/feed/"
    ]
  },
  {
    id: "shanghai", name: "上海", country: "China", region: "Shanghai",
    timezone: "Asia/Shanghai", lat: 31.23, lng: 121.47,
    currency_code: "CNY", currency_symbol: "¥", original_language: "zh",
    location_summary: "China's eastern port city, ~25 million people; lane houses beside skyscrapers",
    rss_feeds: [
      "https://www.sixthtone.com/rss",
      "https://www.whatsonweibo.com/feed/",
      "https://radii.co/feed",
      "https://www.thatsmags.com/rss",
      "https://restofworld.org/feed/"
    ]
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
    rss_feeds: ["https://restofworld.org/feed/"]
  },
  // ─── Middle East & West Asia ────────────────────────────────
  {
    id: "istanbul", name: "İstanbul", country: "Türkiye", region: "İstanbul",
    timezone: "Europe/Istanbul", lat: 41.01, lng: 28.97,
    currency_code: "TRY", currency_symbol: "₺", original_language: "tr",
    location_summary: "a transcontinental city straddling Europe and Asia, ~15 million people",
    rss_feeds: [
      "https://www.dailysabah.com/rssFeed/26",
      "https://restofworld.org/feed/"
    ]
  },
  {
    id: "tehran", name: "Tehran", country: "Iran", region: "Tehran",
    timezone: "Asia/Tehran", lat: 35.69, lng: 51.39,
    currency_code: "IRR", currency_symbol: "﷼", original_language: "fa",
    location_summary: "Iran's capital in the foothills of the Alborz, ~9 million people",
    rss_feeds: [
      "https://www.tehrantimes.com/rss",
      "https://restofworld.org/feed/"
    ]
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
    rss_feeds: ["https://sloveniatimes.com/feed"]
  },
  {
    id: "kyiv", name: "Київ", country: "Ukraine", region: "Kyiv",
    timezone: "Europe/Kyiv", lat: 50.45, lng: 30.52,
    currency_code: "UAH", currency_symbol: "₴", original_language: "uk",
    location_summary: "Ukraine's capital on the Dnipro, ~3 million people",
    rss_feeds: [
      "https://english.nv.ua/rss/all.xml",
      "https://restofworld.org/feed/"
    ]
  },
  {
    id: "reykjavik", name: "Reykjavík", country: "Iceland", region: "Höfuðborgarsvæðið",
    timezone: "Atlantic/Reykjavik", lat: 64.15, lng: -21.94,
    currency_code: "ISK", currency_symbol: "kr", original_language: "is",
    location_summary: "Iceland's capital on the North Atlantic, ~140k people; geologically restless",
    rss_feeds: [
      "https://www.icelandreview.com/feed/",
      "https://hakaimagazine.com/feed/"
    ]
  },
  // ─── North America ──────────────────────────────────────────
  {
    id: "new-york", name: "New York", country: "United States", region: "New York",
    timezone: "America/New_York", lat: 40.71, lng: -74.01,
    currency_code: "USD", currency_symbol: "$", original_language: "en",
    location_summary: "the east-coast metropolis at the mouth of the Hudson, ~8 million people",
    rss_feeds: ["https://gothamist.com/feed"]
  },
  {
    id: "new-orleans", name: "New Orleans", country: "United States", region: "Louisiana",
    timezone: "America/Chicago", lat: 29.95, lng: -90.07,
    currency_code: "USD", currency_symbol: "$", original_language: "en",
    location_summary: "a Gulf Coast port city in the Mississippi delta, ~380k people",
    rss_feeds: ["https://www.antigravitymagazine.com/feed/"]
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
      "https://www.premiumtimesng.com/feed",
      "https://restofworld.org/feed/"
    ]
  },
  {
    id: "nairobi", name: "Nairobi", country: "Kenya", region: "Nairobi",
    timezone: "Africa/Nairobi", lat: -1.29, lng: 36.82,
    currency_code: "KES", currency_symbol: "KSh", original_language: "en",
    location_summary: "Kenya's highland capital, ~4.4 million people; matatu routes and acacia skylines",
    rss_feeds: [
      "https://www.standardmedia.co.ke/rss/headlines.php",
      "https://restofworld.org/feed/"
    ]
  },
  {
    id: "cape-town", name: "Cape Town", country: "South Africa", region: "Western Cape",
    timezone: "Africa/Johannesburg", lat: -33.92, lng: 18.42,
    currency_code: "ZAR", currency_symbol: "R", original_language: "en",
    location_summary: "a port city below Table Mountain, ~4.6 million people",
    rss_feeds: [
      "https://www.dailymaverick.co.za/dmrss/",
      "https://hakaimagazine.com/feed/"
    ]
  },
  // ─── Oceania ────────────────────────────────────────────────
  {
    id: "melbourne", name: "Melbourne", country: "Australia", region: "Victoria",
    timezone: "Australia/Melbourne", lat: -37.81, lng: 144.96,
    currency_code: "AUD", currency_symbol: "A$", original_language: "en",
    location_summary: "Australia's southern metropolis on Port Phillip Bay, ~5 million people",
    rss_feeds: ["https://www.abc.net.au/news/feed/51120/rss.xml"]
  },
  // ─── Central Asia ───────────────────────────────────────────
  {
    id: "almaty", name: "Almaty", country: "Kazakhstan", region: "Almaty",
    timezone: "Asia/Almaty", lat: 43.24, lng: 76.95,
    currency_code: "KZT", currency_symbol: "₸", original_language: "kk",
    location_summary: "Kazakhstan's largest city under the Tian Shan mountains, ~2 million people",
    rss_feeds: [
      "https://timesca.com/feed",
      "https://astanatimes.com/feed/",
      "https://thediplomat.com/category/central-asia/feed/"
    ]
  },
  // ─── Caribbean ──────────────────────────────────────────────
  {
    id: "havana", name: "La Habana", country: "Cuba", region: "La Habana",
    timezone: "America/Havana", lat: 23.13, lng: -82.38,
    currency_code: "CUP", currency_symbol: "$", original_language: "es",
    location_summary: "Cuba's capital on the Caribbean coast, ~2.1 million people; vintage cars and crumbling colonnades",
    rss_feeds: [
      "https://oncubanews.com/feed/",
      "https://roadsandkingdoms.com/feed/"
    ]
  },
  {
    id: "kingston", name: "Kingston", country: "Jamaica", region: "Surrey",
    timezone: "America/Jamaica", lat: 17.97, lng: -76.79,
    currency_code: "JMD", currency_symbol: "J$", original_language: "en",
    location_summary: "Jamaica's capital on the south coast, ~1 million people; reggae city in a hill bowl",
    rss_feeds: [],
    is_active: false
  },
  {
    id: "port-au-prince", name: "Pòtoprens", country: "Haiti", region: "Ouest",
    timezone: "America/Port-au-Prince", lat: 18.59, lng: -72.31,
    currency_code: "HTG", currency_symbol: "G", original_language: "ht",
    location_summary: "Haiti's capital on a Caribbean bay, ~1 million people; Kreyòl life under pressure",
    rss_feeds: [
      "https://ayibopost.com/feed/",
      "https://globalvoices.org/feed/"
    ]
  },
  // ─── Andes ──────────────────────────────────────────────────
  {
    id: "lima", name: "Lima", country: "Peru", region: "Lima",
    timezone: "America/Lima", lat: -12.05, lng: -77.04,
    currency_code: "PEN", currency_symbol: "S/", original_language: "es",
    location_summary: "Peru's coastal capital under permanent garúa fog, ~10 million people",
    rss_feeds: [
      "https://www.peruviantimes.com/feed/",
      "https://news.mongabay.com/feed/"
    ]
  },
  // ─── Brazil / Lusophone Atlantic ────────────────────────────
  {
    id: "sao-paulo", name: "São Paulo", country: "Brazil", region: "São Paulo",
    timezone: "America/Sao_Paulo", lat: -23.55, lng: -46.63,
    currency_code: "BRL", currency_symbol: "R$", original_language: "pt",
    location_summary: "Brazil's largest city, ~22 million people; concrete forest under perpetual rain",
    rss_feeds: [
      "https://feeds.folha.uol.com.br/cotidiano/rss091.xml",
      "https://piaui.folha.uol.com.br/feed/"
    ]
  },
  // ─── Maghreb ────────────────────────────────────────────────
  {
    id: "tunis", name: "تونس", country: "Tunisia", region: "Tunis",
    timezone: "Africa/Tunis", lat: 36.81, lng: 10.18,
    currency_code: "TND", currency_symbol: "د.ت", original_language: "ar",
    location_summary: "Tunisia's Mediterranean capital, ~1 million people; medina kasbah braided with French boulevards",
    rss_feeds: [
      "https://inkyfada.com/en/feed/",
      "https://nawaat.org/feed/"
    ]
  },
  // ─── North Africa / Middle East (non-paywall) ───────────────
  {
    id: "cairo", name: "القاهرة", country: "Egypt", region: "Cairo",
    timezone: "Africa/Cairo", lat: 30.05, lng: 31.24,
    currency_code: "EGP", currency_symbol: "ج.م", original_language: "ar",
    location_summary: "Egypt's capital on the Nile, ~22 million people; Coptic and Muslim quarters under perpetual dust",
    rss_feeds: [
      "https://www.madamasr.com/en/feed/",
      "https://religionunplugged.com/news?format=rss"
    ]
  },
  // ─── Pacific ────────────────────────────────────────────────
  {
    id: "honolulu", name: "Honolulu", country: "United States", region: "Hawaii",
    timezone: "Pacific/Honolulu", lat: 21.31, lng: -157.86,
    currency_code: "USD", currency_symbol: "$", original_language: "en",
    location_summary: "Hawaii's capital on Oʻahu, ~350k people; Pacific crossroads under volcanic ridge",
    rss_feeds: [
      "https://www.civilbeat.org/feed/",
      "https://www.rnz.co.nz/rss/pacific.xml"
    ]
  },
  // ─── Arctic Circle ──────────────────────────────────────────
  {
    id: "tromso", name: "Tromsø", country: "Norway", region: "Troms og Finnmark",
    timezone: "Europe/Oslo", lat: 69.65, lng: 18.96,
    currency_code: "NOK", currency_symbol: "kr", original_language: "no",
    location_summary: "Norway's Arctic Circle city, ~78k people; polar nights and Sami country",
    rss_feeds: [],
    is_active: false
  },
  // ─── South Asia (non-Mumbai) ────────────────────────────────
  {
    id: "kathmandu", name: "काठमाडौं", country: "Nepal", region: "Bagmati",
    timezone: "Asia/Kathmandu", lat: 27.72, lng: 85.32,
    currency_code: "NPR", currency_symbol: "रू", original_language: "ne",
    location_summary: "Nepal's capital in the Himalayan foothills, ~1.5 million people; Hindu-Buddhist old city",
    rss_feeds: [
      "https://www.himalmag.com/feed/",
      "https://news.mongabay.com/feed/",
      "https://religionunplugged.com/news?format=rss"
    ]
  },
  // ─── Indonesia / Java ───────────────────────────────────────
  {
    id: "yogyakarta", name: "Yogyakarta", country: "Indonesia", region: "Daerah Istimewa Yogyakarta",
    timezone: "Asia/Jakarta", lat: -7.80, lng: 110.36,
    currency_code: "IDR", currency_symbol: "Rp", original_language: "id",
    location_summary: "Java's cultural capital and sultanate, ~420k people; batik, Borobudur, students",
    rss_feeds: [
      "https://rss.tempo.co/nasional",
      "https://coconuts.co/bali/feed/"
    ]
  },
  // ─── US Pacific Northwest ───────────────────────────────────
  {
    id: "portland", name: "Portland", country: "United States", region: "Oregon",
    timezone: "America/Los_Angeles", lat: 45.52, lng: -122.68,
    currency_code: "USD", currency_symbol: "$", original_language: "en",
    location_summary: "Pacific Northwest city on the Willamette, ~650k people; rain, bridges, food carts",
    rss_feeds: ["https://www.oregonlive.com/arc/outboundfeeds/rss/?outputType=xml"]
  },
  // ─── Quebec / Francophone North America ─────────────────────
  {
    id: "montreal", name: "Montréal", country: "Canada", region: "Québec",
    timezone: "America/Toronto", lat: 45.50, lng: -73.57,
    currency_code: "CAD", currency_symbol: "C$", original_language: "fr",
    location_summary: "Québec's island metropolis on the St. Lawrence, ~1.8 million people; bilingual Catholic-secular city",
    rss_feeds: [
      "https://montrealgazette.com/feed/",
      "https://www.cbc.ca/webfeed/rss/rss-canada-montreal"
    ]
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
        ${c.location_summary ?? null}, ${c.rss_feeds as unknown as string[]},
        ${"is_active" in c && c.is_active === false ? false : true}
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
