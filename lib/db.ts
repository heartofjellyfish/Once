import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Thin wrapper around the Neon serverless driver.
 *
 * The app works in two modes:
 *   - DB mode: DATABASE_URL is set. Reads published stories from Postgres,
 *     moderation lives in the queue table, budget is tracked in the ledger.
 *   - JSON mode: DATABASE_URL is unset. Falls back to data/stories.json.
 *     Admin pages return 503. Useful for local dev and failsafe.
 *
 * Kept tiny on purpose: no ORM, no migrations framework. schema.sql is
 * authoritative and `scripts/db-migrate.mjs` runs it.
 */

let _sql: NeonQueryFunction<false, false> | null = null;

/** Prefer DATABASE_URL; fall back to every common Vercel / Neon name. */
function dbUrl(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.NEON_DATABASE_URL
  );
}

/** Returns the Neon SQL tag, or null if no DB URL is configured. */
export function sql(): NeonQueryFunction<false, false> | null {
  if (_sql) return _sql;
  const url = dbUrl();
  if (!url) return null;
  _sql = neon(url);
  return _sql;
}

export function dbAvailable(): boolean {
  return !!dbUrl();
}

/** Throwing variant for admin paths that require DB. */
export function requireSql(): NeonQueryFunction<false, false> {
  const s = sql();
  if (!s) {
    throw new Error(
      "No DATABASE_URL / POSTGRES_URL set. Add Postgres to the project."
    );
  }
  return s;
}
