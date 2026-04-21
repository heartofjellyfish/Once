import Parser from "rss-parser";
import type { City } from "./types";
import { requireSql } from "./db";

/**
 * RSS/Atom fetching + normalization.
 *
 * Per cron cycle:
 *   1. Pick one active city (weighted by last_ingest_at — oldest first).
 *   2. Fetch all its configured feeds in parallel.
 *   3. Flatten to a common entry shape, drop entries older than WINDOW.
 *   4. De-dup by URL within this run.
 *
 * Caller passes the entries to the AI pre-filter.
 */

export interface FeedEntry {
  title: string;
  link: string;          // canonical URL — dedupe key
  snippet: string;       // short excerpt for pre-filter
  content: string;       // longer body when the feed provides one
  pub_date: Date | null;
  source_host: string;   // e.g. "reddit.com"
  feed_url: string;      // which feed this came from
}

const parser = new Parser({
  timeout: 12_000,
  headers: {
    "User-Agent":
      "OnceBot/1.0 (+https://once.qi.land; a small curated-moments site)"
  }
});

/**
 * Time window — entries older than this get dropped.
 *
 * 7 days fits low-volume literary feeds (Rest of World, Hakai, Atlas
 * Obscura) that publish 1–3 pieces a week; daily papers still
 * surface their freshest content because dedup + the top-5-per-city
 * ranking push staler entries toward the back. Too-narrow window
 * starves the slow feeds entirely.
 */
export const ENTRY_WINDOW_HOURS = 24 * 7;

/**
 * Pick one active city for this cron cycle. Prefers cities that haven't
 * been ingested in a while (or ever). Randomises within the top bucket
 * so two runs in the same hour don't dead-lock on the same city.
 */
export async function pickCity(): Promise<City | null> {
  const sql = requireSql();
  const rows = (await sql`
    select
      id, name, country, region, timezone,
      lat::float8 as lat,
      lng::float8 as lng,
      currency_code, currency_symbol, original_language,
      location_summary, rss_feeds, is_active,
      last_ingest_at
    from cities
    where is_active = true
    order by coalesce(last_ingest_at, 'epoch'::timestamptz) asc
    limit 5
  `) as unknown as City[];

  if (rows.length === 0) return null;
  // Randomise inside the top 5 oldest so rotation isn't perfectly
  // deterministic.
  return rows[Math.floor(Math.random() * rows.length)];
}

/** Mark a city as just-ingested, so it rotates toward the back. */
export async function markCityIngested(cityId: string): Promise<void> {
  const sql = requireSql();
  await sql`
    update cities set last_ingest_at = now() where id = ${cityId}
  `;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Fetch one feed, normalise entries, drop anything older than the window. */
async function fetchFeed(feedUrl: string): Promise<FeedEntry[]> {
  let parsed;
  try {
    parsed = await parser.parseURL(feedUrl);
  } catch (err) {
    console.warn(`[sources] feed failed ${feedUrl}:`, (err as Error).message);
    return [];
  }

  const cutoff = Date.now() - ENTRY_WINDOW_HOURS * 60 * 60 * 1000;
  const out: FeedEntry[] = [];

  for (const item of parsed.items || []) {
    const link = item.link || "";
    if (!link) continue;

    const pub = item.isoDate ? new Date(item.isoDate) : null;
    if (pub && pub.getTime() < cutoff) continue;

    const title = stripHtml(item.title || "").trim();
    const snippet = truncate(
      stripHtml(item.contentSnippet || item.content || "").trim(),
      400
    );
    const content = stripHtml(item.content || item["content:encoded"] || "");

    if (!title || !snippet) continue;

    out.push({
      title,
      link,
      snippet,
      content: truncate(content, 3000),
      pub_date: pub,
      source_host: hostOf(link),
      feed_url: feedUrl
    });
  }

  // Keep newest first, cap at 15 per feed — limits downstream AI cost.
  out.sort((a, b) => {
    const at = a.pub_date ? a.pub_date.getTime() : 0;
    const bt = b.pub_date ? b.pub_date.getTime() : 0;
    return bt - at;
  });
  return out.slice(0, 15);
}

/** Fetch all of a city's feeds, merge, de-dup by canonical URL. */
export async function fetchCityEntries(city: City): Promise<FeedEntry[]> {
  const results = await Promise.all((city.rss_feeds ?? []).map(fetchFeed));
  const seen = new Set<string>();
  const merged: FeedEntry[] = [];
  for (const batch of results) {
    for (const e of batch) {
      const key = e.link.split("?")[0]; // drop query params from dedup key
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(e);
    }
  }
  return merged;
}

function stripHtml(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
