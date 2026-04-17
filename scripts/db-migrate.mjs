#!/usr/bin/env node
// Applies db/schema.sql to the DATABASE_URL. Idempotent: all statements
// use "create ... if not exists" so re-running is safe.
//
// Usage:
//   DATABASE_URL=postgres://... node scripts/db-migrate.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { neon } from "@neondatabase/serverless";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, "../db/schema.sql");
const schema = readFileSync(schemaPath, "utf8");

const url =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.POSTGRES_URL;

if (!url) {
  console.error("No DATABASE_URL / POSTGRES_URL is set.");
  process.exit(1);
}

const sql = neon(url);

// Strip SQL line comments FIRST, then split. Previously the naive
// "filter out statements that start with --" logic threw away whole
// statements whose heading lines were comments, which was basically
// every CREATE TABLE in schema.sql.
const schemaNoComments = schema.replace(/--[^\n]*/g, "");

const statements = schemaNoComments
  .split(/;\s*(?:\n|$)/)
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

let applied = 0;
for (const stmt of statements) {
  try {
    // neon() tagged-template doesn't support dynamic strings, so use query():
    await sql.query(stmt);
    applied++;
  } catch (err) {
    console.error("FAILED statement:\n", stmt, "\n", err);
    process.exit(1);
  }
}

console.log(`✓ schema applied (${applied} statements).`);
