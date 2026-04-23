/**
 * Journey — per-card pipeline trace.
 *
 * Every moderation_queue row carries a `journey` jsonb column that
 * records how the card came to be: source, dedup, prefilter, body
 * fetch, score, rewrite, photo. One row per pipeline run.
 *
 * The UI collapses it by default and shows just the total cost +
 * duration. Expanded view shows each stage with model, tokens, cost,
 * ms, plus stage-specific details.
 *
 * Design notes:
 *   - This is a denormalised snapshot for admin UI. The truth lives
 *     in ai_decisions + budget_ledger tables.
 *   - Null for historic rows (pre-journey).
 *   - For manual /admin/compose and /admin/manual entries, populate
 *     a trimmed journey with just {source: {kind:'manual'}}.
 */
export interface JourneySource {
  kind: "rss" | "manual" | "compose";
  city_id?: string | null;
  city_name?: string | null;
  feed_url?: string | null;
  source_url?: string | null;
  source_host?: string | null;
  entry_title?: string | null;
  pub_date?: string | null;
}

export interface JourneyDedup {
  url_hash_seen: boolean;
  content_hash_seen: boolean;
  ms: number;
}

export interface JourneyPrefilter {
  model: string;
  pass: boolean;
  why: string;
  prompt_tokens: number;
  cached_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  ms: number;
}

export interface JourneyBody {
  method: "jsonld" | "readability" | "og" | "rss_fallback" | "error";
  chars: number;
  paywalled: boolean;
  ms: number;
  error?: string;
  /** First ~120 chars of the recovered body, for reviewer preview. */
  preview?: string;
}

export interface JourneyScore {
  model: string;
  c1: "no_fit" | "basic_fit" | "strong_fit";
  c2: "no_fit" | "basic_fit" | "strong_fit";
  rationale: string;
  prompt_tokens: number;
  cached_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  ms: number;
}

export interface JourneyRewrite {
  model: string;
  prompt_tokens: number;
  cached_tokens: number;
  completion_tokens: number;
  cost_usd: number;
  ms: number;
  length: number;
  /** First ~120 chars of the rewrite, for reviewer preview. */
  preview?: string;
}

/**
 * Photo stage log. Accepts the existing `photo_journey` array shape
 * used by lib/ogImage.ts (og_skipped / og_scraped / og_judged /
 * library_query / relevance_judged / fallback) and wraps it with
 * per-stage model + totals.
 */
export interface JourneyPhoto {
  source: string | null;           // "og" | "unsplash" | "pexels" | "watercolor" | "picsum"
  model: string | null;            // vision model used, if any
  query: string | null;            // if library search
  vision_score: number | null;
  cost_usd: number;
  ms: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  steps: any[];                    // raw photo_journey array
}

export interface JourneyTotals {
  cost_usd: number;
  ms: number;
  tokens: number;
}

export interface JourneyJSON {
  v: 1;
  source: JourneySource;
  dedup?: JourneyDedup;
  prefilter?: JourneyPrefilter;
  body?: JourneyBody;
  score?: JourneyScore;
  rewrite?: JourneyRewrite;
  photo?: JourneyPhoto;
  totals: JourneyTotals;
  started_at: string;
  finished_at?: string;
}

/**
 * Builder used during pipeline execution. Call addXxx() at each stage
 * then toJSON() at write-time.
 */
export class Journey {
  readonly startedAtMs: number;
  private source: JourneySource;
  private dedup?: JourneyDedup;
  private prefilter?: JourneyPrefilter;
  private body?: JourneyBody;
  private score?: JourneyScore;
  private rewrite?: JourneyRewrite;
  private photo?: JourneyPhoto;

  constructor(source: JourneySource) {
    this.source = source;
    this.startedAtMs = Date.now();
  }

  addDedup(d: JourneyDedup): void {
    this.dedup = d;
  }
  addPrefilter(p: JourneyPrefilter): void {
    this.prefilter = p;
  }
  addBody(b: JourneyBody): void {
    this.body = b;
  }
  addScore(s: JourneyScore): void {
    this.score = s;
  }
  addRewrite(r: JourneyRewrite): void {
    this.rewrite = r;
  }
  addPhoto(p: JourneyPhoto): void {
    this.photo = p;
  }

  toJSON(): JourneyJSON {
    const cost =
      (this.prefilter?.cost_usd ?? 0) +
      (this.score?.cost_usd ?? 0) +
      (this.rewrite?.cost_usd ?? 0) +
      (this.photo?.cost_usd ?? 0);
    const tokens =
      (this.prefilter?.prompt_tokens ?? 0) +
      (this.prefilter?.completion_tokens ?? 0) +
      (this.score?.prompt_tokens ?? 0) +
      (this.score?.completion_tokens ?? 0) +
      (this.rewrite?.prompt_tokens ?? 0) +
      (this.rewrite?.completion_tokens ?? 0);
    const ms = Date.now() - this.startedAtMs;
    return {
      v: 1,
      source: this.source,
      dedup: this.dedup,
      prefilter: this.prefilter,
      body: this.body,
      score: this.score,
      rewrite: this.rewrite,
      photo: this.photo,
      totals: { cost_usd: cost, ms, tokens },
      started_at: new Date(this.startedAtMs).toISOString(),
      finished_at: new Date().toISOString()
    };
  }
}
