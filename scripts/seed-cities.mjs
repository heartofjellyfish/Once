#!/usr/bin/env node
// Seeds the `cities` table — 24 curated Once cities, chosen to cover
// every continent and the places where the world's weight tends to
// settle (China, US, war-adjacent, Africa, South Asia, Oceania).
//
// Feeds are hand-picked toward soft-news / hyperlocal / cultural
// register, avoiding pure politics, markets, celebrity, and trend
// pieces. The pipeline's prefilter handles the rest.
//
// Idempotent: uses ON CONFLICT DO UPDATE so re-running updates feed
// lists and location summaries but preserves last_ingest_at. Cities
// not in this list are deactivated (is_active=false) rather than
// deleted, so stories already published remain attributable.
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
  // ─── East Asia ────────────────────────────────────────────────
  {
    id: "tokyo",
    name: "Tokyo",
    country: "Japan",
    region: "Tokyo Metropolis",
    timezone: "Asia/Tokyo",
    lat: 35.68, lng: 139.77,
    currency_code: "JPY", currency_symbol: "¥",
    original_language: "ja",
    location_summary: "Japan's capital on Tokyo Bay, ~14 million people",
    // SoraNews24: the uncanny-little-thing-from-Japan beat, the Once
    // benchmark. Nippon.com: quieter cultural second.
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
    lat: 37.57, lng: 126.98,
    currency_code: "KRW", currency_symbol: "₩",
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
    lat: 25.03, lng: 121.57,
    currency_code: "TWD", currency_symbol: "NT$",
    original_language: "zh",
    location_summary: "Taiwan's capital in a subtropical basin, ~2.5 million people",
    rss_feeds: ["https://www.taipeitimes.com/xml/index.rss"]
  },
  {
    id: "beijing",
    name: "北京",
    country: "China",
    region: "Beijing",
    timezone: "Asia/Shanghai",
    lat: 39.90, lng: 116.41,
    currency_code: "CNY", currency_symbol: "¥",
    original_language: "zh",
    location_summary: "China's capital, ~21 million people; hutong alleys braided with ministries",
    // Sixth Tone: "small voices, big times" — Once's natural register
    // in English. Covers China broadly but often Beijing-anchored.
    rss_feeds: ["https://www.sixthtone.com/rss", "https://www.whatsonweibo.com/feed/"]
  },
  {
    id: "tianjin",
    name: "天津",
    country: "China",
    region: "Tianjin",
    timezone: "Asia/Shanghai",
    lat: 39.13, lng: 117.20,
    currency_code: "CNY", currency_symbol: "¥",
    original_language: "zh",
    location_summary: "a major port city in northern China, ~15 million people",
    // No strong soft-news English feed; relies on compose + Sixth Tone
    // crossover. Can be improved later.
    rss_feeds: ["https://www.sixthtone.com/rss", "https://www.whatsonweibo.com/feed/"]
  },
  {
    id: "shanghai",
    name: "上海",
    country: "China",
    region: "Shanghai",
    timezone: "Asia/Shanghai",
    lat: 31.23, lng: 121.47,
    currency_code: "CNY", currency_symbol: "¥",
    original_language: "zh",
    location_summary: "China's eastern port city, ~25 million people; lane houses beside skyscrapers",
    // Sixth Tone again — pending a dedicated Shanghai feed.
    rss_feeds: ["https://www.sixthtone.com/rss", "https://www.whatsonweibo.com/feed/"]
  },

  // ─── Southeast Asia ───────────────────────────────────────────
  {
    id: "saigon",
    name: "Hồ Chí Minh City",
    country: "Vietnam",
    region: "Hồ Chí Minh City",
    timezone: "Asia/Ho_Chi_Minh",
    lat: 10.77, lng: 106.70,
    currency_code: "VND", currency_symbol: "₫",
    original_language: "vi",
    location_summary: "Vietnam's largest city on the Saigon River, ~9 million people",
    // Saigoneer: hẻm-gem profiles, unexpected-history, kindness anecdotes.
    rss_feeds: ["https://saigoneer.com/?format=feed&type=rss"]
  },

  // ─── South Asia ───────────────────────────────────────────────
  {
    id: "mumbai",
    name: "Mumbai",
    country: "India",
    region: "Maharashtra",
    timezone: "Asia/Kolkata",
    lat: 19.08, lng: 72.88,
    currency_code: "INR", currency_symbol: "₹",
    original_language: "hi",
    location_summary: "India's Arabian Sea metropolis, ~21 million people; chawl life next to high-rises",
    // Hindustan Times Mumbai — most reliable Mumbai-specific English RSS
    // currently working. Prefilter strips politics heavily.
    rss_feeds: [
      "https://www.hindustantimes.com/feeds/rss/cities/mumbai-news/rssfeed.xml"
    ]
  },

  // ─── Middle East & West Asia ──────────────────────────────────
  {
    id: "istanbul",
    name: "İstanbul",
    country: "Türkiye",
    region: "İstanbul",
    timezone: "Europe/Istanbul",
    lat: 41.01, lng: 28.97,
    currency_code: "TRY", currency_symbol: "₺",
    original_language: "tr",
    location_summary: "a transcontinental city straddling Europe and Asia, ~15 million people",
    rss_feeds: ["https://www.dailysabah.com/rssFeed/26"]
  },
  {
    id: "tehran",
    name: "Tehran",
    country: "Iran",
    region: "Tehran",
    timezone: "Asia/Tehran",
    lat: 35.69, lng: 51.39,
    currency_code: "IRR", currency_symbol: "﷼",
    original_language: "fa",
    location_summary: "Iran's capital in the foothills of the Alborz, ~9 million people",
    // Tehran Times English — lifestyle / culture sections surface
    // plenty of bounded moments despite political top-of-page noise.
    rss_feeds: ["https://www.tehrantimes.com/rss"]
  },

  // ─── Europe ───────────────────────────────────────────────────
  {
    id: "lisbon",
    name: "Lisboa",
    country: "Portugal",
    region: "Lisboa",
    timezone: "Europe/Lisbon",
    lat: 38.72, lng: -9.14,
    currency_code: "EUR", currency_symbol: "€",
    original_language: "pt",
    location_summary: "Portugal's capital on the Atlantic coast, ~550k people",
    rss_feeds: ["https://atlaslisboa.com/feed/"]
  },
  {
    id: "helsinki",
    name: "Helsinki",
    country: "Finland",
    region: "Uusimaa",
    timezone: "Europe/Helsinki",
    lat: 60.17, lng: 24.94,
    currency_code: "EUR", currency_symbol: "€",
    original_language: "fi",
    location_summary: "Finland's capital on the Gulf of Finland, ~660k people",
    rss_feeds: ["https://finland.fi/feed/"]
  },
  {
    id: "ljubljana",
    name: "Ljubljana",
    country: "Slovenia",
    region: "Osrednjeslovenska",
    timezone: "Europe/Ljubljana",
    lat: 46.05, lng: 14.51,
    currency_code: "EUR", currency_symbol: "€",
    original_language: "sl",
    location_summary: "Slovenia's small river-side capital in the Alps foothills, ~285k people",
    rss_feeds: ["https://sloveniatimes.com/feed"]
  },
  {
    id: "kyiv",
    name: "Київ",
    country: "Ukraine",
    region: "Kyiv",
    timezone: "Europe/Kyiv",
    lat: 50.45, lng: 30.52,
    currency_code: "UAH", currency_symbol: "₴",
    original_language: "uk",
    location_summary: "Ukraine's capital on the Dnipro, ~3 million people",
    // New Voice of Ukraine (english.nv.ua): English, broad Ukrainian
    // coverage. Kyiv Independent doesn't publish RSS; NV does.
    rss_feeds: ["https://english.nv.ua/rss/all.xml"]
  },
  {
    id: "reykjavik",
    name: "Reykjavík",
    country: "Iceland",
    region: "Höfuðborgarsvæðið",
    timezone: "Atlantic/Reykjavik",
    lat: 64.15, lng: -21.94,
    currency_code: "ISK", currency_symbol: "kr",
    original_language: "is",
    location_summary: "Iceland's capital on the North Atlantic, ~140k people; geologically restless",
    // Iceland Review: English, understated, volcanoes and sheep.
    rss_feeds: ["https://www.icelandreview.com/feed/"]
  },

  // ─── North America ────────────────────────────────────────────
  {
    id: "new-york",
    name: "New York",
    country: "United States",
    region: "New York",
    timezone: "America/New_York",
    lat: 40.71, lng: -74.01,
    currency_code: "USD", currency_symbol: "$",
    original_language: "en",
    location_summary: "the east-coast metropolis at the mouth of the Hudson, ~8 million people",
    // Gothamist — hyperlocal, human-scale. Hell Gate's public RSS
    // is currently 404.
    rss_feeds: ["https://gothamist.com/feed"]
  },
  {
    id: "new-orleans",
    name: "New Orleans",
    country: "United States",
    region: "Louisiana",
    timezone: "America/Chicago",
    lat: 29.95, lng: -90.07,
    currency_code: "USD", currency_symbol: "$",
    original_language: "en",
    location_summary: "a Gulf Coast port city in the Mississippi delta, ~380k people",
    // Antigravity Magazine: culture/music paper, human-scale NOLA.
    // NOLA.com's RSS is unreliable (rate-limited).
    rss_feeds: ["https://www.antigravitymagazine.com/feed/"]
  },

  // ─── Latin America ────────────────────────────────────────────
  {
    id: "oaxaca",
    name: "Oaxaca de Juárez",
    country: "Mexico",
    region: "Oaxaca",
    timezone: "America/Mexico_City",
    lat: 17.06, lng: -96.72,
    currency_code: "MXN", currency_symbol: "$",
    original_language: "es",
    location_summary: "a colonial mountain city in southern Mexico, ~275k people",
    rss_feeds: ["https://theoaxacapost.com/feed/"]
  },
  {
    id: "valparaiso",
    name: "Valparaíso",
    country: "Chile",
    region: "Valparaíso",
    timezone: "America/Santiago",
    lat: -33.05, lng: -71.62,
    currency_code: "CLP", currency_symbol: "$",
    original_language: "es",
    location_summary: "a hillside port city on Chile's Pacific coast, ~300k people",
    rss_feeds: ["https://orgulloporteno.cl/feed/"]
  },
  {
    id: "antigua",
    name: "Antigua Guatemala",
    country: "Guatemala",
    region: "Sacatepéquez",
    timezone: "America/Guatemala",
    lat: 14.56, lng: -90.73,
    currency_code: "GTQ", currency_symbol: "Q",
    original_language: "es",
    location_summary: "a colonial highland town at the foot of three volcanoes, ~45k people",
    rss_feeds: ["https://quepasa.gt/feed/"]
  },

  // ─── Africa ───────────────────────────────────────────────────
  {
    id: "lagos",
    name: "Lagos",
    country: "Nigeria",
    region: "Lagos",
    timezone: "Africa/Lagos",
    lat: 6.45, lng: 3.39,
    currency_code: "NGN", currency_symbol: "₦",
    original_language: "en",
    location_summary: "Nigeria's commercial megacity on the Gulf of Guinea, ~15+ million people",
    // Premium Times Nigeria — English, dense local news. Prefilter
    // will trim politics. Pulse + Guardian Nigeria both block bots.
    rss_feeds: ["https://www.premiumtimesng.com/feed"]
  },
  {
    id: "nairobi",
    name: "Nairobi",
    country: "Kenya",
    region: "Nairobi",
    timezone: "Africa/Nairobi",
    lat: -1.29, lng: 36.82,
    currency_code: "KES", currency_symbol: "KSh",
    original_language: "en",
    location_summary: "Kenya's highland capital, ~4.4 million people; matatu routes and acacia skylines",
    // The Standard Kenya: English, reliable RSS. Nation/The Star's
    // RSS endpoints are dead or bot-gated.
    rss_feeds: ["https://www.standardmedia.co.ke/rss/headlines.php"]
  },
  {
    id: "cape-town",
    name: "Cape Town",
    country: "South Africa",
    region: "Western Cape",
    timezone: "Africa/Johannesburg",
    lat: -33.92, lng: 18.42,
    currency_code: "ZAR", currency_symbol: "R",
    original_language: "en",
    location_summary: "a port city below Table Mountain, ~4.6 million people",
    // Daily Maverick: long-form, considered, often has local vignettes.
    rss_feeds: ["https://www.dailymaverick.co.za/dmrss/"]
  },

  // ─── Oceania ──────────────────────────────────────────────────
  {
    id: "melbourne",
    name: "Melbourne",
    country: "Australia",
    region: "Victoria",
    timezone: "Australia/Melbourne",
    lat: -37.81, lng: 144.96,
    currency_code: "AUD", currency_symbol: "A$",
    original_language: "en",
    location_summary: "Australia's southern metropolis on Port Phillip Bay, ~5 million people",
    // ABC Melbourne + The Age Victoria. ABC's hyperlocal feed is the
    // stronger register match; The Age is a broader second.
    rss_feeds: [
      "https://www.abc.net.au/news/feed/51120/rss.xml",
      "https://www.theage.com.au/rss/national/victoria.xml"
    ]
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
