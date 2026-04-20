/**
 * Email digest. Sent by /api/cron/digest once a day if there are
 * enough unreviewed items in the queue.
 *
 * Design (user-driven):
 *   - Email is a SOFT NUDGE, not an action surface. Single button to
 *     /admin/review. No per-card approve buttons, no magic links.
 *   - Pull model: the queue always lives in /admin/review; the user
 *     drains it at their own pace. The email just says "N waiting."
 *   - Skipped entirely if the queue has < MIN_PENDING items.
 *
 * Requires RESEND_API_KEY and DIGEST_TO (recipient email) env vars.
 * If either is missing the digest is a no-op (logs and skips).
 */

import { Resend } from "resend";

const FROM = process.env.DIGEST_FROM || "Once <noreply@qi.land>";
const SITE = process.env.SITE_ORIGIN || "https://once.qi.land";
const MIN_PENDING = Number(process.env.DIGEST_MIN_PENDING || "10");

export interface DigestSummary {
  pendingCount: number;
  cityCounts: Array<{ city: string; count: number }>;
  sample: Array<{
    city: string;
    original: string;
    english: string;
    scores: { specificity: number; resonance: number; register: number };
  }>;
}

function renderHtml(summary: DigestSummary): string {
  const topCities = summary.cityCounts.slice(0, 8);
  const topCitiesHtml = topCities
    .map(
      (c) =>
        `<div style="font:14px/1.5 Georgia,serif;color:#3a3a36;padding:2px 0"><span style="color:#7a7a6e;width:120px;display:inline-block">${escapeHtml(
          c.city
        )}</span><span style="font-variant-numeric:tabular-nums">${c.count}</span></div>`
    )
    .join("");

  const sampleHtml = summary.sample
    .slice(0, 3)
    .map(
      (s) => `
        <div style="margin:18px 0;padding:14px 16px;border-left:3px solid #2a2a26;background:#faf7f0;border-radius:0 3px 3px 0">
          <div style="font:10px/1.4 -apple-system,sans-serif;letter-spacing:0.14em;text-transform:uppercase;color:#7a7a6e;margin-bottom:6px">${escapeHtml(
            s.city
          )} · s${s.scores.specificity}·r${s.scores.resonance}·g${s.scores.register}</div>
          <div style="font:17px/1.45 Georgia,serif;color:#2a2a26;margin-bottom:4px">${escapeHtml(
            s.original
          )}</div>
          ${
            s.english
              ? `<div style="font:13px/1.5 Georgia,serif;color:#7a7a6e">${escapeHtml(
                  s.english
                )}</div>`
              : ""
          }
        </div>`
    )
    .join("");

  return `<!doctype html>
<html>
<body style="background:#ece6d6;margin:0;padding:36px 0;font:16px/1.6 Georgia,serif;color:#2a2a26">
  <div style="max-width:560px;margin:0 auto;background:#fffaf0;padding:36px 36px 30px;border-radius:4px;box-shadow:0 2px 12px rgba(0,0,0,0.04)">

    <div style="font:14px/1 -apple-system,sans-serif;letter-spacing:0.2em;text-transform:uppercase;color:#7a7a6e;margin-bottom:10px">Once · daily</div>

    <h1 style="font:400 28px/1.2 Georgia,serif;margin:0 0 6px;color:#2a2a26">
      ${summary.pendingCount} waiting
    </h1>
    <p style="font:15px/1.5 Georgia,serif;color:#7a7a6e;margin:0 0 22px">
      Queue is ${summary.pendingCount} stories deep across ${summary.cityCounts.length} cities.
      Review when you have time — it doesn't expire.
    </p>

    <a href="${SITE}/admin" style="display:inline-block;background:#2a2a26;color:#fffaf0;padding:11px 22px;border-radius:3px;text-decoration:none;font:12px/1 -apple-system,sans-serif;letter-spacing:0.14em;text-transform:uppercase">Review queue →</a>

    <div style="margin-top:30px;padding-top:18px;border-top:1px solid #e2dbc7">
      <div style="font:11px/1 -apple-system,sans-serif;letter-spacing:0.14em;text-transform:uppercase;color:#7a7a6e;margin-bottom:10px">By city</div>
      ${topCitiesHtml}
    </div>

    ${
      sampleHtml
        ? `<div style="margin-top:26px;padding-top:18px;border-top:1px solid #e2dbc7">
             <div style="font:11px/1 -apple-system,sans-serif;letter-spacing:0.14em;text-transform:uppercase;color:#7a7a6e;margin-bottom:4px">Three from today's queue</div>
             ${sampleHtml}
           </div>`
        : ""
    }

    <div style="margin-top:28px;font:11px/1.4 -apple-system,sans-serif;color:#a89e87;text-align:center">
      This email is a soft nudge. Ignore it until you have a moment.
    </div>
  </div>
</body>
</html>`;
}

function renderText(summary: DigestSummary): string {
  const lines = [
    `Once · daily`,
    ``,
    `${summary.pendingCount} waiting · ${summary.cityCounts.length} cities`,
    ``,
    `Review: ${SITE}/admin`,
    ``,
    `By city:`,
    ...summary.cityCounts
      .slice(0, 8)
      .map((c) => `  ${c.city.padEnd(24, " ")} ${c.count}`)
  ];
  return lines.join("\n");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendDigest(summary: DigestSummary): Promise<{
  ok: boolean;
  skipped?: string;
  id?: string;
  error?: string;
}> {
  if (summary.pendingCount < MIN_PENDING) {
    return {
      ok: true,
      skipped: `queue below threshold (${summary.pendingCount} < ${MIN_PENDING})`
    };
  }

  const key = process.env.RESEND_API_KEY;
  const to = process.env.DIGEST_TO;
  if (!key || !to) {
    return {
      ok: false,
      skipped: "RESEND_API_KEY or DIGEST_TO not set"
    };
  }

  try {
    const resend = new Resend(key);
    const result = await resend.emails.send({
      from: FROM,
      to,
      subject: `Once · ${summary.pendingCount} waiting`,
      html: renderHtml(summary),
      text: renderText(summary)
    });
    if (result.error) {
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
