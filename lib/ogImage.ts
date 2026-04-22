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
import { judgeOgImage } from "./photoVision";

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

/**
 * Top-level: always returns a URL. Preference order:
 *   1. Best OG / twitter image we could scrape from the source article.
 *   2. Unsplash keyword search — if an `unsplashQuery` is supplied.
 *      Bakeoff showed Unsplash has the most on-brand film/documentary
 *      aesthetic among free image libraries.
 *   3. Stamen Watercolor map of the story's city (if lat/lng provided) —
 *      brand-coherent with the postmark stamp, always works.
 *   4. Deterministic picsum placeholder keyed on seedKey — last resort.
 */
export async function resolveHeroImage(
  sourceUrl: string,
  seedKey: string,
  fallback?: {
    lat: number | null | undefined;
    lng: number | null | undefined;
    unsplashQuery?: string | null;
    /** Skip OG entirely — used by the admin reroll button. */
    forceSkipOg?: boolean;
  }
): Promise<string> {
  // Step 1: OG scrape — unless the source host is on the known-stocky
  // skip list (e.g. nippon.com) or the caller forced skip (admin reroll),
  // in which case jump straight to Unsplash.
  const host = hostOf(sourceUrl);
  const skipOg =
    fallback?.forceSkipOg || (host ? OG_SKIP_HOSTS.has(host) : false);
  const scraped = skipOg ? null : await scrapeOgImage(sourceUrl);

  // Step 2: if we got an OG image, ask Haiku vision whether it's the
  // kind of photo Once wants (documentary / ordinary-moment) or a
  // stocky / press-release / logo one. If the judge passes, keep it.
  // If the judge says no, fall through to Unsplash. If the judge is
  // unreachable (no key, network error), keep the OG image — current
  // behavior, don't regress.
  if (scraped) {
    const verdict = await judgeOgImage(scraped);
    if (!verdict || verdict.keep) return scraped;
  }

  const query = fallback?.unsplashQuery?.trim();
  if (query) {
    const found = await searchUnsplash(query);
    if (found) return found;
  }

  if (
    fallback &&
    fallback.lat != null &&
    fallback.lng != null &&
    Number.isFinite(fallback.lat) &&
    Number.isFinite(fallback.lng)
  ) {
    // Request a large 3:2 watercolor panel — matches the polaroid's
    // aspect ratio so object-fit: cover doesn't clip anything important.
    return watercolorMapUrl(fallback.lat, fallback.lng, {
      size: 720,
      height: 480,
      zoom: 12
    });
  }

  return placeholderImage(seedKey);
}
