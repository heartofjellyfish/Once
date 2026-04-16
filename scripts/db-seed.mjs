#!/usr/bin/env node
// Seeds the stories table from data/stories.json.
// Idempotent: uses ON CONFLICT (id) DO NOTHING so re-running leaves
// existing rows alone.
//
// Usage:
//   DATABASE_URL=postgres://... node scripts/db-seed.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

const here = dirname(fileURLToPath(import.meta.url));
const stories = JSON.parse(
  readFileSync(resolve(here, "../data/stories.json"), "utf8")
);

const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL;

if (!url) {
  console.error("No DATABASE_URL / POSTGRES_URL is set.");
  process.exit(1);
}

const sql = neon(url);

let inserted = 0;
let skipped = 0;

for (const s of stories) {
  const result = await sql`
    insert into stories (
      id, photo_url, country, region, city, timezone, local_hour,
      original_language, original_text, english_text,
      currency_code, currency_symbol,
      milk_price_local, eggs_price_local,
      milk_price_usd, eggs_price_usd,
      selected_hour, source_url, source_name,
      lat, lng
    ) values (
      ${s.id}, ${s.photo_url ?? null}, ${s.country}, ${s.region ?? null},
      ${s.city}, ${s.timezone}, ${s.local_hour},
      ${s.original_language}, ${s.original_text}, ${s.english_text ?? ""},
      ${s.currency_code}, ${s.currency_symbol},
      ${s.milk_price_local}, ${s.eggs_price_local},
      ${s.milk_price_usd}, ${s.eggs_price_usd},
      ${s.selected_hour ?? null}, ${s.source_url ?? null}, ${s.source_name ?? null},
      ${s.lat ?? null}, ${s.lng ?? null}
    )
    on conflict (id) do update set
      lat = coalesce(excluded.lat, stories.lat),
      lng = coalesce(excluded.lng, stories.lng)
    returning id
  `;
  if (result.length > 0) inserted++;
  else skipped++;
}

console.log(`✓ seed complete: ${inserted} inserted, ${skipped} already present.`);
