import type { Story } from "./types";
import data from "@/data/stories.json";

/**
 * Data access seam. Today this reads a curated JSON file.
 * Real ingestion (scraper, CMS, DB) can replace this without
 * touching the view layer.
 */
export function loadStories(): Story[] {
  return data as Story[];
}

/** Hours since the Unix epoch, in UTC. */
export function currentHour(now: Date = new Date()): number {
  return Math.floor(now.getTime() / (1000 * 60 * 60));
}

/**
 * The local hour (0–23) at `now` in the given IANA timezone.
 * Uses Intl, so no library needed.
 */
export function localHourIn(timezone: string, now: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    hour12: false
  });
  const part = fmt.formatToParts(now).find((p) => p.type === "hour");
  // Some locales emit "24" at midnight; normalise.
  return ((Number(part?.value ?? "0") % 24) + 24) % 24;
}

/**
 * The window (in hours) after a moment took place during which
 * we still consider it "fresh". Wider window = more candidates per
 * UTC hour, but the moment feels less recent. 1 hour exactly would
 * match the spec literally; 1–4 keeps the dataset feasible at this size.
 */
const FRESH_WINDOW_HOURS = 4;

/**
 * Pure selection: given a list of stories and a moment in time,
 * return the story to show. Exported so tests/scripts can reason
 * about it without touching the data file.
 */
export function selectStory(stories: Story[], now: Date = new Date()): Story {
  if (stories.length === 0) {
    throw new Error("No stories available");
  }

  // Pinned slot wins, if a curator ever uses it.
  const hour = currentHour(now);
  const pinned = stories.find((s) => s.selected_hour === hour);
  if (pinned) return pinned;

  // "Fresh" stories: the moment took place 1..FRESH_WINDOW_HOURS
  // hours ago, locally. Sort deterministically by id so the same
  // hour always picks the same story across replicas.
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

  // Fallback: nothing currently "fresh". Rotate through the full
  // set so the page always has something to show.
  const idx = ((hour % stories.length) + stories.length) % stories.length;
  return stories[idx];
}

export function getCurrentStory(now: Date = new Date()): Story {
  return selectStory(loadStories(), now);
}

/** Dev-only: return all stories (for /api/recent). */
export function getAllStories(): Story[] {
  return loadStories();
}

/**
 * Diagnostic: how many stories are "fresh" at each UTC hour of a
 * representative day. Used by scripts/check-coverage.mjs to catch
 * dataset gaps before they ship.
 */
export function freshnessByUtcHour(
  stories: Story[] = loadStories(),
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
