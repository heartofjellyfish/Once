/**
 * Hero-image resolution for ingest.
 *
 * Tries the article's OG image (og:image / twitter:image / first reasonable
 * <img>) and falls back to a deterministic picsum placeholder so every
 * story always has *some* photo.
 */

const FETCH_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 400_000; // ~400KB — plenty for <head>

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

/** Placeholder URL — deterministic per (city, headline). */
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
        // Some sites 403 without a UA.
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

/** Pull out the first matching attribute value for a meta name/property. */
function findMeta(html: string, key: string): string | null {
  // Match <meta property="og:image" content="..."> or name=, or attrs in any order.
  const re = new RegExp(
    `<meta\\s+[^>]*(?:property|name)\\s*=\\s*["']${key}["'][^>]*>`,
    "i"
  );
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  const content = tag.match(/content\s*=\s*["']([^"']+)["']/i)?.[1];
  return content ? content.trim() : null;
}

/** Extract the first <img> that looks real (skips tiny/sprite images). */
function findFirstImg(html: string): string | null {
  const re = /<img\s+[^>]*src\s*=\s*["']([^"']+)["'][^>]*>/gi;
  for (const m of html.matchAll(re)) {
    const src = m[1];
    if (!src) continue;
    if (/^data:/i.test(src)) continue;
    if (/sprite|blank|spacer|pixel|1x1/i.test(src)) continue;
    return src;
  }
  return null;
}

function absolutize(raw: string, base: string): string | null {
  try {
    return new URL(raw, base).toString();
  } catch {
    return null;
  }
}

/**
 * Try to find a hero image for `sourceUrl`. Returns null if no usable image
 * was found (callers should fall back to placeholderImage).
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

  // Read at most MAX_HTML_BYTES. fetch() body can be huge on some sites.
  let html = "";
  try {
    const reader = res.body?.getReader();
    if (!reader) {
      html = await res.text();
    } else {
      const decoder = new TextDecoder();
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
    }
  } catch {
    return null;
  }

  if (!html) return null;

  // Priority order.
  const candidates = [
    findMeta(html, "og:image:secure_url"),
    findMeta(html, "og:image"),
    findMeta(html, "twitter:image"),
    findMeta(html, "twitter:image:src"),
    findFirstImg(html)
  ].filter((x): x is string => !!x);

  for (const raw of candidates) {
    const abs = absolutize(raw, sourceUrl);
    if (abs && /^https?:\/\//i.test(abs)) return abs;
  }
  return null;
}

/**
 * Top-level: always returns a URL. Tries to scrape, falls back to picsum
 * seeded by `seedKey` (usually city-headline) so the same story always
 * gets the same placeholder.
 */
export async function resolveHeroImage(
  sourceUrl: string,
  seedKey: string
): Promise<string> {
  const scraped = await scrapeOgImage(sourceUrl);
  if (scraped) return scraped;
  return placeholderImage(seedKey);
}
