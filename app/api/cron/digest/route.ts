import { NextResponse } from "next/server";
import { requireSql, dbAvailable } from "@/lib/db";
import { sendDigest, type DigestSummary } from "@/lib/email";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Daily digest endpoint. Hit by Vercel Cron (see vercel.json) at 9am
 * local time. Computes pending-queue stats + a small sample, then hands
 * off to sendDigest which either mails or skips (below threshold).
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
      { ok: false, error: "database unavailable" },
      { status: 500 }
    );
  }

  const sql = requireSql();

  const counts = (await sql`
    select coalesce(city, '(unknown)') as city, count(*)::int as n
    from moderation_queue
    where status = 'pending'
    group by city
    order by n desc
  `) as unknown as { city: string; n: number }[];

  const pendingCount = counts.reduce((a, b) => a + b.n, 0);

  const sample = (await sql`
    select city, original_text, english_text,
           score_specificity, score_resonance, score_register
    from moderation_queue
    where status = 'pending' and original_text is not null
    order by least(score_specificity, score_resonance, score_register) desc nulls last,
             random()
    limit 3
  `) as unknown as {
    city: string | null;
    original_text: string | null;
    english_text: string | null;
    score_specificity: number | null;
    score_resonance: number | null;
    score_register: number | null;
  }[];

  const summary: DigestSummary = {
    pendingCount,
    cityCounts: counts.map((c) => ({ city: c.city, count: c.n })),
    sample: sample.map((s) => ({
      city: s.city ?? "(unknown)",
      original: s.original_text ?? "",
      english: s.english_text ?? "",
      scores: {
        specificity: s.score_specificity ?? 0,
        resonance: s.score_resonance ?? 0,
        register: s.score_register ?? 0
      }
    }))
  };

  const result = await sendDigest(summary);
  return NextResponse.json({
    ...result,
    pending: pendingCount
  });
}
