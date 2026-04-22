/**
 * Pexels image search — second fallback in the hero-photo chain, after
 * Unsplash. 200 req/hr free tier (vs Unsplash's 50), so Pexels absorbs
 * the bulk of the daily cron's queries.
 *
 * Aesthetic is slightly more stock-y than Unsplash — a bakeoff on real
 * Once stories ranked it #2 of five free libraries — but the Haiku
 * relevance judge filters out outright irrelevant hits either way.
 */
const PEXELS_SEARCH = "https://api.pexels.com/v1/search";
const FETCH_TIMEOUT_MS = 6000;

export interface PexelsHit {
  url: string;
  attribution: string;
  author: string;
}

export async function searchPexels(
  query: string,
  perPage = 3
): Promise<PexelsHit | null> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) {
    console.warn("[pexels] PEXELS_API_KEY is not set");
    return null;
  }
  if (!query) return null;

  const url = `${PEXELS_SEARCH}?query=${encodeURIComponent(
    query
  )}&per_page=${perPage}&orientation=landscape`;

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { Authorization: key }
    });
    if (!res.ok) {
      console.warn(
        `[pexels] "${query}" → http ${res.status} (rate-limit remaining: ${res.headers.get("x-ratelimit-remaining") ?? "?"})`
      );
      return null;
    }
    const j = (await res.json()) as {
      total_results?: number;
      photos?: Array<{
        src?: { large?: string; large2x?: string; original?: string };
        url?: string;
        photographer?: string;
        photographer_url?: string;
      }>;
    };
    const first = j.photos?.[0];
    const picked = first?.src?.large || first?.src?.large2x || first?.src?.original;
    if (!picked) {
      console.info(
        `[pexels] "${query}" → total=${j.total_results ?? 0}, landscape results=${j.photos?.length ?? 0}`
      );
      return null;
    }
    return {
      url: picked,
      attribution: first?.url || first?.photographer_url || "",
      author: first?.photographer || "Pexels"
    };
  } catch (err) {
    console.warn(`[pexels] "${query}" threw:`, (err as Error).message);
    return null;
  } finally {
    clearTimeout(t);
  }
}
