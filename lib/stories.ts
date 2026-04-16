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

/**
 * Hours since the Unix epoch, in UTC.
 * Every user on Earth sees the same story in the same hour —
 * Once is a shared window, not a personalized feed.
 */
export function currentHour(now: Date = new Date()): number {
  return Math.floor(now.getTime() / (1000 * 60 * 60));
}

/**
 * Deterministic rotation. If `selected_hour` is pinned on a story,
 * prefer that assignment. Otherwise rotate by index.
 */
export function getCurrentStory(now: Date = new Date()): Story {
  const stories = loadStories();
  if (stories.length === 0) {
    throw new Error("No stories available");
  }

  const hour = currentHour(now);

  const pinned = stories.find((s) => s.selected_hour === hour);
  if (pinned) return pinned;

  const idx = ((hour % stories.length) + stories.length) % stories.length;
  return stories[idx];
}

/** Dev-only: return all stories (for /api/recent). */
export function getAllStories(): Story[] {
  return loadStories();
}
