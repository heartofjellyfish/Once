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
  selected_hour?: number; // optional pinned slot

  /** Original news source URL (shown as a small link below the moment). */
  source_url?: string;
  /** Human-readable source name (shown if source_url is set). */
  source_name?: string;
}
