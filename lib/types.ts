export interface Story {
  id: string;
  photo_url?: string;

  country: string;
  region?: string;
  city: string;

  original_language: string; // ISO 639-1
  original_text: string;
  english_text: string;

  /** IANA timezone for the location, e.g. "Europe/Lisbon". */
  timezone: string;
  /** Local hour (0-23) at which the moment took place. */
  local_hour: number;

  /** Approximate latitude of the city (degrees). Used for the watercolor map postmark. */
  lat?: number;
  /** Approximate longitude of the city (degrees). */
  lng?: number;

  currency_code: string;   // ISO 4217
  currency_symbol: string; // €, ¥, kr, ...

  milk_price_local: number;
  eggs_price_local: number;
  milk_price_usd: number;
  eggs_price_usd: number;

  published_at?: string; // ISO datetime

  /** Original news source URL (shown as a small link below the moment). */
  source_url?: string;
  /** Human-readable source name (shown if source_url is set). */
  source_name?: string;

  /** Weather snapshot for the city at fetch time, e.g. "Cloudy, 18°C". */
  weather_current?: string;
  /** Brief location intro, e.g. "a district in northern China, ~1M people". */
  location_summary?: string;
  /** When the ingest pipeline picked up this story from its source. */
  fetched_at?: string;
}

/** City config — the pipeline picks one of these per cron cycle. */
export interface City {
  id: string;
  name: string;
  country: string;
  region?: string;
  timezone: string;
  lat: number;
  lng: number;
  currency_code?: string;
  currency_symbol?: string;
  original_language?: string;
  location_summary?: string;
  rss_feeds: string[];
  is_active: boolean;
  last_ingest_at?: string;
}
