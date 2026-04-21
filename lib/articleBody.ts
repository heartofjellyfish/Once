/**
 * Article body fetch.
 *
 * Given a URL, try a cascade of strategies to recover real article
 * text so the scorer + rewrite have more than the RSS hook to work
 * with. In priority order:
 *
 *   1. JSON-LD `articleBody`           — some CMSes inline the body
 *   2. OpenGraph + first <article> <p>s — robust fallback
 *   3. @mozilla/readability             — the same algorithm Firefox
 *                                          Reader View uses
 *
 * If all three return less text than the RSS snippet, we flag the
 * source as paywalled/teaser and fall back to the snippet. The
 * scorer knows how to down-weight paywalled pieces from there.
 *
 * Design:
 *   - 10 s hard timeout per URL
 *   - Standard browser UA + accept headers
 *   - Never throws — failure is silent, caller gets {text: null}
 *   - Best-effort: the goal is "usually get body"; occasional misses
 *     are fine and cheap (we just fall back to RSS)
 */

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";

export interface ArticleBody {
  text: string | null;
  /** Which strategy produced the body — useful for logs. */
  source: "jsonld" | "readability" | "og" | "rss_fallback" | "error";
  /** Char count of the returned body, for teaser-detection. */
  length: number;
  /** True when we couldn't recover more than ~400 chars. */
  paywalled: boolean;
  /** Error message for debugging (only set on error). */
  error?: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

const FETCH_TIMEOUT_MS = 10_000;
const MIN_BODY_CHARS = 400;

async function fetchHtml(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });
    if (!resp.ok) return null;
    // Cap at 2MB to avoid loading giant pages
    const buf = await resp.arrayBuffer();
    if (buf.byteLength > 2_000_000) return null;
    return new TextDecoder("utf-8").decode(buf);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Try JSON-LD articleBody. Many WordPress/Ghost/NYT-style CMSes
 * embed the full body here as structured data.
 */
function tryJsonLd(doc: Document): string | null {
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]');
  for (const s of Array.from(scripts)) {
    const raw = s.textContent ?? "";
    try {
      const parsed = JSON.parse(raw);
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const obj of candidates) {
        if (obj && typeof obj === "object") {
          const body = (obj as Record<string, unknown>).articleBody;
          if (typeof body === "string" && body.length > MIN_BODY_CHARS) {
            return body;
          }
          // Some CMSes nest under @graph
          const graph = (obj as Record<string, unknown>)["@graph"];
          if (Array.isArray(graph)) {
            for (const g of graph) {
              const b = (g as Record<string, unknown>).articleBody;
              if (typeof b === "string" && b.length > MIN_BODY_CHARS) return b;
            }
          }
        }
      }
    } catch {
      // malformed JSON-LD, skip
    }
  }
  return null;
}

/** OpenGraph description + first N visible <p>s inside <article>. */
function tryOgPlusArticle(doc: Document): string | null {
  const og =
    doc.querySelector('meta[property="og:description"]')?.getAttribute("content") ??
    doc.querySelector('meta[name="description"]')?.getAttribute("content") ??
    "";

  const article = doc.querySelector("article") || doc.querySelector("main") || doc.body;
  if (!article) return og && og.length > MIN_BODY_CHARS ? og : null;

  const ps = Array.from(article.querySelectorAll("p"))
    .map((p) => (p.textContent ?? "").trim())
    .filter((t) => t.length > 40) // skip captions, bylines
    .slice(0, 10);

  const body = (og + "\n\n" + ps.join("\n\n")).trim();
  return body.length > MIN_BODY_CHARS ? body : null;
}

/** Readability.js — the same algorithm Firefox Reader View uses. */
function tryReadability(doc: Document): string | null {
  try {
    const reader = new Readability(doc.cloneNode(true) as Document);
    const parsed = reader.parse();
    const text = (parsed?.textContent ?? "").trim();
    return text.length > MIN_BODY_CHARS ? text : null;
  } catch {
    return null;
  }
}

/**
 * Fetch and extract the article body. Returns a {text, source}
 * struct — never throws.
 */
export async function fetchArticleBody(url: string): Promise<ArticleBody> {
  if (!url || !url.startsWith("http")) {
    return { text: null, source: "error", length: 0, paywalled: false, error: "bad url" };
  }

  const html = await fetchHtml(url);
  if (!html) {
    return {
      text: null,
      source: "error",
      length: 0,
      paywalled: false,
      error: "fetch failed or 403/paywall-blocked"
    };
  }

  let dom: JSDOM;
  try {
    dom = new JSDOM(html, { url });
  } catch (err) {
    return {
      text: null,
      source: "error",
      length: 0,
      paywalled: false,
      error: `jsdom: ${err instanceof Error ? err.message : String(err)}`
    };
  }
  const doc = dom.window.document;

  // Try strategies in priority order.
  const strategies: Array<[ArticleBody["source"], () => string | null]> = [
    ["jsonld", () => tryJsonLd(doc)],
    ["readability", () => tryReadability(doc)],
    ["og", () => tryOgPlusArticle(doc)]
  ];

  for (const [source, fn] of strategies) {
    try {
      const text = fn();
      if (text && text.length >= MIN_BODY_CHARS) {
        return {
          text: text.slice(0, 8_000), // cap at ~2k tokens
          source,
          length: text.length,
          paywalled: false
        };
      }
    } catch {
      // try next strategy
    }
  }

  // All strategies produced less than MIN_BODY_CHARS → probably
  // paywalled or heavily bot-blocked.
  return {
    text: null,
    source: "rss_fallback",
    length: 0,
    paywalled: true
  };
}
