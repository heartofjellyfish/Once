/**
 * Unsplash image search — one of the fallbacks in the hero-photo chain.
 *
 * Called when OG scrape of the source article fails (or the vision
 * judge rejects it). We search Unsplash with a keyword built from the
 * story's city plus a visual noun pulled from the rewrite, and return
 * the best-looking result along with attribution info.
 *
 * Why Unsplash (not Openverse, Pexels, Pixabay): a bakeoff on real Once
 * stories showed Unsplash has the most coherent, film-like aesthetic —
 * closest to Once's register.
 */
const UNSPLASH_SEARCH = "https://api.unsplash.com/search/photos";
const FETCH_TIMEOUT_MS = 6000;

export interface UnsplashHit {
  url: string;
  attribution: string; // link to photographer's Unsplash page for credit
  author: string;
}

export async function searchUnsplash(
  query: string,
  perPage = 3
): Promise<UnsplashHit | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) {
    console.warn("[unsplash] UNSPLASH_ACCESS_KEY is not set");
    return null;
  }
  if (!query) return null;

  const url = `${UNSPLASH_SEARCH}?query=${encodeURIComponent(
    query
  )}&per_page=${perPage}&content_filter=high&orientation=landscape`;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { Authorization: `Client-ID ${key}` }
    });
    if (!res.ok) {
      console.warn(
        `[unsplash] "${query}" → http ${res.status} (rate-limit remaining: ${res.headers.get("x-ratelimit-remaining") ?? "?"})`
      );
      return null;
    }
    const j = (await res.json()) as {
      total?: number;
      results?: Array<{
        urls?: { regular?: string; full?: string };
        links?: { html?: string };
        user?: { name?: string };
      }>;
    };
    const first = j.results?.[0];
    const picked = first?.urls?.regular || first?.urls?.full;
    if (!picked) {
      console.info(
        `[unsplash] "${query}" → total=${j.total ?? 0}, landscape results=${j.results?.length ?? 0}`
      );
      return null;
    }
    return {
      url: picked,
      attribution: first?.links?.html || "",
      author: first?.user?.name || ""
    };
  } catch (err) {
    console.warn(`[unsplash] "${query}" threw:`, (err as Error).message);
    return null;
  } finally {
    clearTimeout(t);
  }
}
