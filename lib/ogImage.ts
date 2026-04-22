/**
 * Hero-image resolution for ingest.
 *
 * Strategy, in order:
 *   1. Scrape the article's head for og:image / twitter:image candidates.
 *      Parse size hints (og:image:width / og:image:height) where they
 *      exist, then pick the best-scoring candidate (bigger is better,
 *      obvious logos rejected).
 *   2. If that fails, fall back to a 720×480 Stamen Watercolor map
 *      centred on the story's city — on-brand for Once (same art style
 *      as the postmark stamp), deterministic per location, and free.
 *   3. If no lat/lng is available, last-resort picsum placeholder so
 *      the story still has *some* photo.
 */

import { watercolorMapUrl } from "./map";
import { searchUnsplash } from "./unsplash";
import { judgeOgImage, judgeUnsplashRelevance } from "./photoVision";
import { requireSql } from "./db";

/**
 * Add columns for photo metadata the first time any resolve fires.
 * Idempotent. Surfaced so the admin pending card can show source /
 * query / cost alongside the thumbnail.
 */
let _photoColumnsEnsured = false;
export async function ensurePhotoColumns(): Promise<void> {
  if (_photoColumnsEnsured) return;
  const sql = requireSql();
  await sql`alter table moderation_queue add column if not exists photo_source text`;
  await sql`alter table moderation_queue add column if not exists photo_query text`;
  await sql`alter table moderation_queue add column if not exists photo_attribution_url text`;
  await sql`alter table moderation_queue add column if not exists photo_attribution_name text`;
  await sql`alter table moderation_queue add column if not exists photo_vision_score integer`;
  await sql`alter table moderation_queue add column if not exists photo_vision_reason text`;
  await sql`alter table moderation_queue add column if not exists photo_cost_usd numeric(8,5)`;
  _photoColumnsEnsured = true;
}

// Hosts whose OG images are consistently stocky / press-release / generic.
// Compiled from reviewer experience (see docs/photo.md). For these
// sources we skip OG entirely and jump to the Unsplash keyword search.
const OG_SKIP_HOSTS = new Set<string>([
  "nippon.com",
  "www.nippon.com"
]);

function hostOf(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return null;
  }
}

const FETCH_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 400_000; // ~400KB — plenty for <head>

// URL substrings that almost always indicate a site-level logo or
// generic placeholder rather than a story-specific image. Rejected
// regardless of advertised size.
const LOGO_PATTERNS =
  /(^|[/_.-])(logo|favicon|og[-_]?default|site[-_]?icon|placeholder|default[-_]?image|apple[-_]?touch)(s)?([/_.-]|$)/i;

interface ImageCandidate {
  url: string;
  width?: number;
  height?: number;
  /** Which meta key / <img> type produced this candidate (for debugging). */
  source: "og" | "og:secure" | "twitter" | "twitter:src" | "first-img";
}

/** Slugify a string so it's safe in a picsum seed. */
function slugForSeed(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "once"
  );
}

/** Last-resort placeholder — deterministic per seed. */
export function placeholderImage(seedKey: string): string {
  const seed = slugForSeed(seedKey || "once");
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/1200/900`;
}

async function fetchWithTimeout(url: string): Promise<Response | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: {
        "user-agent":
          "Mozilla/5.0 (compatible; OnceBot/1.0; +https://once.qi.land)",
        accept: "text/html,application/xhtml+xml"
      }
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function readCappedText(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return res.text();
  const decoder = new TextDecoder();
  let html = "";
  let total = 0;
  while (total < MAX_HTML_BYTES) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    html += decoder.decode(value, { stream: true });
  }
  try {
    await reader.cancel();
  } catch {}
  return html;
}

function absolutize(raw: string, base: string): string | null {
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

/**
 * Parse every <meta> and the first <img> into a candidate list. og:image
 * groups are associated with the og:image:width / og:image:height tags
 * that follow them in document order (Open Graph convention).
 */
function extractCandidates(html: string): ImageCandidate[] {
  const out: ImageCandidate[] = [];

  // Walk meta tags in document order, tracking the most-recently-seen
  // og:image block so width/height/secure_url can attach to it.
  const metaRe = /<meta\s+[^>]*>/gi;
  let pending: ImageCandidate | null = null;
  for (const m of html.matchAll(metaRe)) {
    const tag = m[0];
    const key = tag
      .match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]
      ?.toLowerCase();
    const content = tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!key || !content) continue;

    if (key === "og:image") {
      if (pending) out.push(pending);
      pending = { url: content, source: "og" };
    } else if (key === "og:image:secure_url" && pending) {
      // Prefer the secure URL for an existing candidate.
      pending.url = content;
      pending.source = "og:secure";
    } else if (key === "og:image:width" && pending) {
      const n = Number(content);
      if (Number.isFinite(n)) pending.width = n;
    } else if (key === "og:image:height" && pending) {
      const n = Number(content);
      if (Number.isFinite(n)) pending.height = n;
    } else if (key === "twitter:image" || key === "twitter:image:src") {
      out.push({
        url: content,
        source: key === "twitter:image" ? "twitter" : "twitter:src"
      });
    }
  }
  if (pending) out.push(pending);

  // First reasonable <img> as a last-resort candidate.
  const imgRe = /<img\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  for (const m of html.matchAll(imgRe)) {
    const src = m[1];
    if (!src) continue;
    if (/^data:/i.test(src)) continue;
    if (/sprite|blank|spacer|pixel|1x1/i.test(src)) continue;
    // Read width/height attributes if present.
    const tag = m[0];
    const w = Number(tag.match(/\swidth\s*=\s*["']?(\d+)/i)?.[1]);
    const h = Number(tag.match(/\sheight\s*=\s*["']?(\d+)/i)?.[1]);
    out.push({
      url: src,
      width: Number.isFinite(w) ? w : undefined,
      height: Number.isFinite(h) ? h : undefined,
      source: "first-img"
    });
    break; // just the first
  }

  return out;
}

function score(c: ImageCandidate): number {
  // Start with pixel area when known, otherwise a neutral baseline that
  // beats nothing-known-but-obviously-small but loses to anything
  // confidently large.
  let s = c.width && c.height ? c.width * c.height : 260_000;

  // Size floor — reject plausibly-thumbnail candidates if dims known.
  if (c.width && c.width < 300) s -= 500_000;
  if (c.height && c.height < 200) s -= 500_000;

  // Strong penalty for logo-shaped URLs.
  if (LOGO_PATTERNS.test(c.url)) s -= 2_000_000;

  // Preference tiers for the source of the candidate: og > twitter > first-img.
  if (c.source === "og" || c.source === "og:secure") s += 50_000;
  if (c.source === "twitter" || c.source === "twitter:src") s += 20_000;

  return s;
}

/**
 * Try to find a hero image for `sourceUrl`. Returns null if no usable
 * image was found.
 */
export async function scrapeOgImage(sourceUrl: string): Promise<string | null> {
  if (!sourceUrl) return null;

  let res: Response | null = null;
  try {
    res = await fetchWithTimeout(sourceUrl);
  } catch {
    return null;
  }
  if (!res || !res.ok) return null;

  let html = "";
  try {
    html = await readCappedText(res);
  } catch {
    return null;
  }
  if (!html) return null;

  const raw = extractCandidates(html);
  const absolute = raw
    .map((c) => {
      const abs = absolutize(c.url, sourceUrl);
      return abs && /^https?:\/\//i.test(abs) ? { ...c, url: abs } : null;
    })
    .filter((c): c is ImageCandidate => !!c);

  if (absolute.length === 0) return null;

  // Pick the best-scoring candidate, but require a positive score — a
  // sea of logo-only or too-small results means we'd rather fall back.
  const sorted = [...absolute].sort((a, b) => score(b) - score(a));
  const best = sorted[0];
  if (score(best) <= 0) return null;
  return best.url;
}

export interface PhotoResult {
  url: string;
  source: "og" | "unsplash" | "watercolor" | "picsum";
  /** Unsplash query used (null if not reached). */
  query: string | null;
  /** Link to the source article or photographer page, when known. */
  attribution_url: string | null;
  /** Photographer / source name for credit. */
  attribution_name: string | null;
  /** Haiku vision verdict on the OG image, if it was judged. */
  vision_score: number | null;
  vision_reason: string | null;
  /** Rough USD cost of AI calls made during this resolve. */
  cost_usd: number;
}

// Rough fixed estimates — token counts barely vary for these prompts.
// keyword extract: gpt-4o-mini ~150 input + 20 output = ~$0.00004
// Haiku vision judge: ~400 input + 40 output (image tokens dominate)
//   Haiku 4.5 price * typical image = ~$0.003
const COST_VISION_JUDGE = 0.003;

/**
 * Top-level: always returns a PhotoResult. Preference order:
 *   1. OG image from the source article, gated by Haiku vision judge.
 *   2. Unsplash keyword search — if an `unsplashQuery` is supplied.
 *   3. Stamen Watercolor map of the story's city.
 *   4. Deterministic picsum placeholder keyed on seedKey.
 */
export async function resolveHeroImage(
  sourceUrl: string,
  seedKey: string,
  fallback?: {
    lat: number | null | undefined;
    lng: number | null | undefined;
    /** Ladder of Unsplash queries, most-specific first. */
    unsplashQueries?: string[] | null;
    /** Story text for relevance judging of Unsplash hits. */
    storyText?: string | null;
    /** Skip OG entirely — used by the admin reroll button. */
    forceSkipOg?: boolean;
  }
): Promise<PhotoResult> {
  let cost = 0;
  const queries = (fallback?.unsplashQueries || [])
    .map((q) => q?.trim())
    .filter((q): q is string => !!q);

  // Step 1: OG scrape — unless the source host is on the known-stocky
  // skip list (e.g. nippon.com) or the caller forced skip (admin reroll).
  const host = hostOf(sourceUrl);
  const skipOg =
    fallback?.forceSkipOg || (host ? OG_SKIP_HOSTS.has(host) : false);
  const scraped = skipOg ? null : await scrapeOgImage(sourceUrl);

  // Step 2: Haiku vision judges OG. Keep if it passes; fall through if
  // it scores stocky. If the judge is unreachable, keep the OG image.
  if (scraped) {
    const verdict = await judgeOgImage(scraped);
    if (verdict) cost += COST_VISION_JUDGE;
    if (!verdict || verdict.keep) {
      return {
        url: scraped,
        source: "og",
        query: queries[0] ?? null,
        attribution_url: sourceUrl || null,
        attribution_name: host,
        vision_score: verdict?.score ?? null,
        vision_reason: verdict?.reason ?? null,
        cost_usd: cost
      };
    }
  }

  // Try each query in the ladder; each hit gets a Haiku relevance
  // check against the story text so Unsplash's low-precision matching
  // (e.g. returning a ferris wheel because it tagged "Tianjin" but not
  // "lottery") gets filtered out. First hit that's both returned AND
  // judged relevant wins. Fall through to watercolor if every hit is
  // either missing or judged irrelevant.
  const storyText = fallback?.storyText?.trim() || "";
  for (const q of queries) {
    const found = await searchUnsplash(q);
    if (!found) continue;

    let verdict: Awaited<ReturnType<typeof judgeUnsplashRelevance>> = null;
    if (storyText) {
      verdict = await judgeUnsplashRelevance(found.url, storyText);
      if (verdict) cost += COST_VISION_JUDGE;
    }
    // If we can't judge (no ANTHROPIC_API_KEY, error), keep the hit —
    // don't regress to "works worse without Anthropic key".
    if (!verdict || verdict.keep) {
      return {
        url: found.url,
        source: "unsplash",
        query: q,
        attribution_url: found.attribution || null,
        attribution_name: found.author || "Unsplash",
        vision_score: verdict?.score ?? null,
        vision_reason: verdict?.reason ?? null,
        cost_usd: cost
      };
    }
  }

  if (
    fallback &&
    fallback.lat != null &&
    fallback.lng != null &&
    Number.isFinite(fallback.lat) &&
    Number.isFinite(fallback.lng)
  ) {
    const wc = watercolorMapUrl(fallback.lat, fallback.lng, {
      size: 720,
      height: 480,
      zoom: 12
    });
    return {
      url: wc,
      source: "watercolor",
      // Show the whole ladder that was tried so the reviewer can see
      // at a glance what Unsplash didn't have.
      query: queries.length > 0 ? queries.join(" → ") + " (all 0)" : null,
      attribution_url: "https://stadiamaps.com",
      attribution_name: "Stamen Watercolor · Stadia",
      vision_score: null,
      vision_reason: null,
      cost_usd: cost
    };
  }

  return {
    url: placeholderImage(seedKey),
    source: "picsum",
    query: queries.length > 0 ? queries.join(" → ") + " (all 0)" : null,
    attribution_url: null,
    attribution_name: null,
    vision_score: null,
    vision_reason: null,
    cost_usd: cost
  };
}
