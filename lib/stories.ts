import type { Story } from "./types";
import data from "@/data/stories.json";
import { sql } from "./db";

/**
 * Data access seam.
 *
 * Production: reads from Postgres when DATABASE_URL is set.
 * Dev / failsafe: reads from data/stories.json otherwise.
 *
 * The view layer doesn't care which path is taken.
 */
export async function loadStories(): Promise<Story[]> {
  const s = sql();
  if (!s) return data as Story[];

  try {
    const rows = (await s`
      select
        id, photo_url, country, region, city, timezone, local_hour,
        original_language, original_text, english_text,
        currency_code, currency_symbol,
        milk_price_local::float8  as milk_price_local,
        eggs_price_local::float8  as eggs_price_local,
        milk_price_usd::float8    as milk_price_usd,
        eggs_price_usd::float8    as eggs_price_usd,
        published_at, selected_hour,
        lat::float8 as lat,
        lng::float8 as lng,
        source_url, source_name
      from stories
    `) as unknown as Story[];
    // If the table is empty (fresh DB, not yet seeded), fall back to JSON
    // so the page never goes blank.
    if (rows.length === 0) return data as Story[];
    return rows;
  } catch (err) {
    console.error("[once] loadStories DB error, falling back to JSON:", err);
    return data as Story[];
  }
}

/** Hours since the Unix epoch, in UTC. */
export function currentHour(now: Date = new Date()): number {
  return Math.floor(now.getTime() / (1000 * 60 * 60));
}

/** Local hour (0–23) at `now` in the given IANA timezone. */
export function localHourIn(timezone: string, now: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false
  });
  const part = fmt.formatToParts(now).find((p) => p.type === "hour");
  return ((Number(part?.value ?? "0") % 24) + 24) % 24;
}

/** Widest "fresh" window — moment was this many hours ago, locally. */
const FRESH_WINDOW_HOURS = 4;

/** Pure selection logic — exported so tests/scripts can use it. */
export function selectStory(stories: Story[], now: Date = new Date()): Story {
  if (stories.length === 0) {
    throw new Error("No stories available");
  }

  const hour = currentHour(now);
  const pinned = stories.find((s) => s.selected_hour === hour);
  if (pinned) return pinned;

  const fresh = stories
    .filter((s) => {
      const local = localHourIn(s.timezone, now);
      const elapsed = ((local - s.local_hour) % 24 + 24) % 24;
      return elapsed >= 1 && elapsed <= FRESH_WINDOW_HOURS;
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  if (fresh.length > 0) {
    const idx = ((hour % fresh.length) + fresh.length) % fresh.length;
    return fresh[idx];
  }

  const idx = ((hour % stories.length) + stories.length) % stories.length;
  return stories[idx];
}

export async function getCurrentStory(now: Date = new Date()): Promise<Story> {
  const stories = await loadStories();
  return selectStory(stories, now);
}

/** Dev-only: return all stories (for /api/recent). */
export async function getAllStories(): Promise<Story[]> {
  return loadStories();
}

/** Diagnostic for scripts/check-coverage.mjs and admin. */
export function freshnessByUtcHour(
  stories: Story[],
  baseDate: Date = new Date(Date.UTC(2026, 0, 15, 0, 0, 0))
): Record<number, number> {
  const out: Record<number, number> = {};
  for (let h = 0; h < 24; h++) {
    const probe = new Date(baseDate.getTime() + h * 60 * 60 * 1000);
    out[h] = stories.filter((s) => {
      const local = localHourIn(s.timezone, probe);
      const elapsed = ((local - s.local_hour) % 24 + 24) % 24;
      return elapsed >= 1 && elapsed <= FRESH_WINDOW_HOURS;
    }).length;
  }
  return out;
}
