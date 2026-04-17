import { NextResponse } from "next/server";
import { runIngest } from "@/lib/pipeline";
import { dbAvailable } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

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
    return NextResponse.json(
      { ok: false, error: "DATABASE_URL not set" },
      { status: 500 }
    );
  }

  try {
    const url = new URL(req.url);
    const cityId = url.searchParams.get("city") ?? undefined;
    const result = await runIngest({ cityId });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cron/ingest] error:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
