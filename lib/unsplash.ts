/**
 * Unsplash image search — one of the fallbacks in the hero-photo chain.
 *
 * Called when OG scrape of the source article fails (or returns a logo
 * shape). We search Unsplash with a keyword built from the story's city
 * plus a visual noun pulled from the rewrite, and return the best-looking
 * result.
 *
 * Why Unsplash (not Openverse, Pexels, Pixabay): a bakeoff on real Once
 * stories showed Unsplash has the most coherent, film-like aesthetic —
 * closest to Once's register. Openverse has broader CC coverage but the
 * average photo is documentary/amateur, less on-brand.
 *
 * License: Unsplash's license permits use without attribution, though
 * crediting the photographer is encouraged. We store the photo URL only
 * for now; attribution is a future upgrade.
 */
const UNSPLASH_SEARCH = "https://api.unsplash.com/search/photos";
const FETCH_TIMEOUT_MS = 6000;

export async function searchUnsplash(
  query: string,
  perPage = 3
): Promise<string | null> {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key || !query) return null;

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
    if (!res.ok) return null;
    const j = (await res.json()) as {
      results?: Array<{ urls?: { regular?: string; full?: string } }>;
    };
    const first = j.results?.[0];
    // `regular` is ~1080w, fine for hero display. Fall back to `full`
    // only if regular is missing.
    return first?.urls?.regular || first?.urls?.full || null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}
