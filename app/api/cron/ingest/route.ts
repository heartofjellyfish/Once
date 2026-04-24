import { NextResponse } from "next/server";
import { runIngest, runBatchIngest } from "@/lib/pipeline";
import { fillAutoSchedule } from "@/lib/schedule";
import { dbAvailable } from "@/lib/db";

export const runtime = "nodejs";
// Batch run can take several minutes across all cities; ask for the max.
export const maxDuration = 300;

/**
 * Protected cron endpoint. Triggered on a schedule by Vercel Cron
 * (see vercel.json). Can also be called manually via
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" \
 *        https://once.qi.land/api/cron/ingest
 *
 * Vercel automatically sends the Authorization header on scheduled
 * invocations when CRON_SECRET is set.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  if (!dbAvailable()) {
    // Show what DB-looking env vars DO exist so we can see what Vercel
    // actually injected (names only, never values).
    const dbKeys = Object.keys(process.env).filter((k) =>
      /(POSTGRES|DATABASE|NEON|DB_URL)/i.test(k)
    );
    return NextResponse.json(
      {
        ok: false,
        error: "No database URL env var visible to this route",
        checked: [
          "DATABASE_URL",
          "DATABASE_URL_UNPOOLED",
          "POSTGRES_URL",
          "POSTGRES_URL_NON_POOLING",
          "POSTGRES_PRISMA_URL",
          "NEON_DATABASE_URL"
        ],
        db_like_env_keys_found: dbKeys
      },
      { status: 500 }
    );
  }

  try {
    const url = new URL(req.url);
    const cityId = url.searchParams.get("city") ?? undefined;

    // If ?city= is given, single-city run (manual trigger for admin UI
    // "run ingest" button). Otherwise run the full batch across all
    // active cities — this is what the daily cron invokes.
    if (cityId) {
      const result = await runIngest({ cityId });
      return NextResponse.json({ ok: true, ...result });
    }

    const batch = await runBatchIngest();

    // After ingest, pre-fill the next 24 hours of publish_schedule
    // with randomDummyStory picks. Editor-scheduled (manual) rows are
    // left alone. If this fails we still return the batch result —
    // homepage has a drift fallback.
    let schedule_filled = 0;
    let schedule_skipped = 0;
    try {
      const r = await fillAutoSchedule();
      schedule_filled = r.filled;
      schedule_skipped = r.skipped;
    } catch (err) {
      console.warn(
        "[cron/ingest] fillAutoSchedule failed:",
        (err as Error).message
      );
    }

    return NextResponse.json({
      ok: true,
      batch: true,
      ...batch,
      schedule_filled,
      schedule_skipped
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/ingest] error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
