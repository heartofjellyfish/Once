"use server";

import { redirect } from "next/navigation";
import { requireSql } from "@/lib/db";

/**
 * Public submission from /correspond. No auth — anyone can write in.
 * Lands in moderation_queue as status='pending' with reviewer='correspondent'
 * marker. Editor sees it in /admin queue and approves/rejects like any AI
 * candidate. No AI is invoked, so zero token cost.
 *
 * Rate-limited lightly: one submission per IP per 60 s (best-effort — we
 * don't persist the rate-limit state, so it's easily circumvented, but the
 * editor-review gate makes abuse self-defeating).
 */
export async function submitCorrespondence(formData: FormData): Promise<void> {
  const f = (k: string, max = 800) =>
    String(formData.get(k) ?? "").slice(0, max).trim();

  const city = f("city", 80);
  const country = f("country", 80);
  const text = f("text", 800);
  const sourceUrl = f("source_url", 400);
  const name = f("name", 60);

  if (!city || !country || text.length < 10) {
    redirect(
      `/correspond?err=${encodeURIComponent(
        "City, country, and the moment itself are required."
      )}`
    );
  }

  if (sourceUrl && !/^https?:\/\//.test(sourceUrl)) {
    redirect(
      `/correspond?err=${encodeURIComponent(
        "Source link must start with http:// or https://"
      )}`
    );
  }

  const sql = requireSql();

  // Minimal write — editor fills in the rest in /admin/edit if approving.
  // ai_passed_filter = true because a human chose to send this in; it starts
  // with full editorial trust, not "ai-screened".
  const composed =
    (name ? `Submitted by ${name}\n\n` : "") +
    `${text}` +
    (sourceUrl ? `\n\nSource: ${sourceUrl}` : "");

  await sql`
    insert into moderation_queue (
      status, source_url, source_input, source_hint_city,
      ai_model, ai_rationale, ai_passed_filter,
      country, city,
      original_text, english_text,
      fetched_at
    ) values (
      'pending',
      ${sourceUrl || null},
      ${composed},
      ${city},
      'correspondent',
      ${name ? `Hand-submitted by ${name}` : "Hand-submitted via /correspond"},
      true,
      ${country},
      ${city},
      ${text},
      '',
      now()
    )
  `;

  redirect("/correspond?sent=1");
}
