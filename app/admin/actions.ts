"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSql } from "@/lib/db";
import { curate } from "@/lib/curate";
import { runIngest } from "@/lib/pipeline";
import { enrichAndPublish } from "@/lib/enrich";
import { currentHour } from "@/lib/stories";
import { resolveHeroImage } from "@/lib/ogImage";
import { extractPhotoKeyword } from "@/lib/photoKeywords";

/** Slug helper for generated story IDs. ASCII-only, kebab. */
function slug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining marks
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || "item";
}

function shortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

/**
 * ADD — paste raw source text (from a news item, a social post, or your
 * own observation). AI resolves city + rewrites in Once voice + drops it
 * into the pending queue for your review. Two UI modes under /admin/manual
 * (from-source vs write-your-own) both hit this same action.
 */
export async function addAction(formData: FormData): Promise<void> {
  const sourceText = String(formData.get("source_text") ?? "").trim();
  const cityHint = String(formData.get("city_hint") ?? "").trim();
  const sourceUrl = String(formData.get("source_url") ?? "").trim();

  if (sourceText.length < 10) {
    redirect(
      `/admin/manual?err=${encodeURIComponent("text is too short (min 10 chars)")}`
    );
  }

  const sql = requireSql();

  // Insert a placeholder first so we have a queue_id to attach spend to.
  const inserted = (await sql`
    insert into moderation_queue (status, source_url, source_input, source_hint_city)
    values ('pending', ${sourceUrl || null}, ${sourceText}, ${cityHint || null})
    returning id
  `) as unknown as { id: string }[];
  const queueId = inserted[0].id;

  // Run the AI.
  let failureMsg: string | null = null;
  try {
    const { result, model } = await curate(
      { sourceText, cityHint, sourceUrl },
      queueId
    );

    await sql`
      update moderation_queue set
        ai_model          = ${model},
        ai_rationale      = ${result.rationale},
        ai_passed_filter  = ${result.passed_filter},
        country           = ${result.country},
        region            = ${result.region},
        city              = ${result.city},
        timezone          = ${result.timezone},
        local_hour        = ${result.local_hour},
        lat               = ${result.lat},
        lng               = ${result.lng},
        original_language = ${result.original_language},
        original_text     = ${result.original_text},
        english_text      = ${result.english_text},
        currency_code     = ${result.currency_code},
        currency_symbol   = ${result.currency_symbol},
        milk_price_local  = ${result.milk_price_local},
        eggs_price_local  = ${result.eggs_price_local},
        milk_price_usd    = ${result.milk_price_usd},
        eggs_price_usd    = ${result.eggs_price_usd}
      where id = ${queueId}
    `;

    // If the AI filtered it out, auto-reject it so it doesn't clutter the queue.
    if (!result.passed_filter) {
      await sql`
        update moderation_queue
        set status='rejected',
            rejected_reason=${"AI filter: " + result.rationale},
            reviewed_at=now(),
            reviewer='ai'
        where id=${queueId}
      `;
    }
  } catch (err) {
    failureMsg = err instanceof Error ? err.message : String(err);
    await sql`
      update moderation_queue
      set status='rejected',
          rejected_reason=${"AI error: " + (failureMsg ?? "unknown")},
          reviewed_at=now(),
          reviewer='system'
      where id=${queueId}
    `;
  }

  revalidatePath("/admin");
  redirect(failureMsg ? `/admin?err=${encodeURIComponent(failureMsg)}` : "/admin");
}

/**
 * APPROVE — promote a queue item to the published stories table.
 *
 * New design (post-refactor): delegate to enrichAndPublish, which
 * uses the city resolver to fill in timezone / currency / language /
 * prices / location_summary from the canonical cities row. The form
 * only needs city + headline to be non-empty; everything else is
 * derived or reused from the queue's AI rewrite.
 */
export async function approveAction(formData: FormData): Promise<void> {
  const queueId = String(formData.get("id") ?? "");
  if (!queueId) throw new Error("id required");

  const sql = requireSql();

  const queueRows = (await sql`
    select city, source_input, source_url, photo_url,
           original_text, english_text, original_language
    from moderation_queue where id = ${queueId}
  `) as unknown as {
    city: string | null;
    source_input: string | null;
    source_url: string | null;
    photo_url: string | null;
    original_text: string | null;
    english_text: string | null;
    original_language: string | null;
  }[];
  const q = queueRows[0];
  if (!q) throw new Error("queue row not found");

  // Form edits override queue values (the edit page lets the user fix
  // fields before approving).
  const cityText = String(formData.get("city") ?? q.city ?? "").trim();
  const aiRewrite = String(
    formData.get("original_text") ?? q.original_text ?? ""
  ).trim();
  const aiEnglish = String(
    formData.get("english_text") ?? q.english_text ?? ""
  ).trim();
  const aiLanguage = String(
    formData.get("original_language") ?? q.original_language ?? ""
  ).trim();

  // Fallback headline: if the queue has no AI rewrite, take the first
  // line of the source_input (the pipeline writes "title\n\nsnippet").
  const sourceInputTitle =
    (q.source_input ?? "").split(/\n\n/, 1)[0]?.trim() ?? "";
  const headline = aiRewrite || sourceInputTitle;

  if (!cityText || !headline) {
    redirect(
      `/admin/edit/${queueId}?err=${encodeURIComponent(
        "Need a city and a headline (or AI rewrite) before publishing."
      )}`
    );
  }

  const sourceUrl = String(formData.get("source_url") ?? q.source_url ?? "").trim();
  const photoUrl = String(formData.get("photo_url") ?? q.photo_url ?? "").trim();

  let publishedId: string;
  try {
    const result = await enrichAndPublish({
      headline,
      cityText,
      sourceUrl: sourceUrl || undefined,
      photoUrl: photoUrl || undefined,
      preRewrittenOriginal: aiRewrite || undefined,
      preRewrittenEnglish: aiEnglish || undefined,
      preRewrittenLanguage: aiLanguage || undefined
    });
    publishedId = result.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    redirect(
      `/admin/edit/${queueId}?err=${encodeURIComponent(`Enrich failed: ${msg}`)}`
    );
  }

  await sql`
    update moderation_queue
    set status='approved',
        published_as_id=${publishedId},
        reviewed_at=now(),
        reviewer='editor'
    where id=${queueId}
  `;

  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin?tab=approved&pinned=1");
}

/** Manually trigger the ingest pipeline. Optional city override. */
export async function runIngestAction(formData: FormData): Promise<void> {
  const cityId = String(formData.get("city") || "").trim() || undefined;

  let summary = "";
  let errorMsg = "";
  try {
    const r = await runIngest({ cityId });
    const scorePart = r.scores
      ? ` [s${r.scores.specificity}/r${r.scores.resonance}/g${r.scores.register}]`
      : "";
    summary = [
      r.city_name ?? "(no city)",
      r.reason,
      `considered ${r.entries_considered}, prefilter ${r.entries_prefilter_pass}${scorePart}`
    ].join(" · ");
  } catch (err) {
    errorMsg = err instanceof Error ? err.message : String(err);
  }

  revalidatePath("/admin/runs");
  revalidatePath("/admin");
  if (errorMsg) {
    redirect(`/admin/runs?ingest_err=${encodeURIComponent(errorMsg)}`);
  }
  redirect(`/admin/runs?ingest_ok=${encodeURIComponent(summary)}`);
}

/**
 * PIN an already-published story to the current hour so it shows on the
 * homepage immediately, overriding the freshness selector.
 */
export async function pinStoryAction(formData: FormData): Promise<void> {
  const storyId = String(formData.get("story_id") ?? "").trim();
  if (!storyId) throw new Error("story_id required");

  const sql = requireSql();
  const hour = currentHour();
  await sql`
    update stories set selected_hour = ${hour} where id = ${storyId}
  `;
  // Clear any stale pin on other stories for the same hour.
  await sql`
    update stories set selected_hour = null
    where selected_hour = ${hour} and id <> ${storyId}
  `;

  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin?tab=approved&pinned=1");
}

/** PATCH — update editable fields on a published story. */
export async function patchStoryAction(formData: FormData): Promise<void> {
  const storyId = String(formData.get("story_id") ?? "").trim();
  if (!storyId) throw new Error("story_id required");

  const sql = requireSql();
  await sql`
    update stories set
      city              = coalesce(nullif(${String(formData.get("city") ?? "")}, ''), city),
      country           = coalesce(nullif(${String(formData.get("country") ?? "")}, ''), country),
      region            = nullif(${String(formData.get("region") ?? "")}, ''),
      timezone          = coalesce(nullif(${String(formData.get("timezone") ?? "")}, ''), timezone),
      local_hour        = ${Number(formData.get("local_hour") ?? 12)},
      original_language = coalesce(nullif(${String(formData.get("original_language") ?? "")}, ''), original_language),
      original_text     = coalesce(nullif(${String(formData.get("original_text") ?? "")}, ''), original_text),
      english_text      = ${String(formData.get("english_text") ?? "")},
      currency_code     = coalesce(nullif(${String(formData.get("currency_code") ?? "")}, ''), currency_code),
      currency_symbol   = coalesce(nullif(${String(formData.get("currency_symbol") ?? "")}, ''), currency_symbol),
      photo_url         = nullif(${String(formData.get("photo_url") ?? "")}, ''),
      source_url        = nullif(${String(formData.get("source_url") ?? "")}, '')
    where id = ${storyId}
  `;

  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin?tab=approved&patched=1");
}

/** UNPIN — remove a previously-pinned hour, let freshness logic run. */
export async function unpinStoryAction(formData: FormData): Promise<void> {
  const storyId = String(formData.get("story_id") ?? "").trim();
  if (!storyId) throw new Error("story_id required");

  const sql = requireSql();
  await sql`update stories set selected_hour = null where id = ${storyId}`;

  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin?tab=approved");
}

/**
 * MARK GOOD — record a positive training signal without publishing.
 *
 * Use when you want to teach the AI "this is Once-shape" but don't
 * want the story on the homepage right now. Sets status='approved'
 * (so it counts toward the gold set) but skips enrichAndPublish
 * entirely, so no stories row is created.
 *
 * You can still publish later from the approved tab (when the
 * approveAndPublish flow is wired there). For now the training
 * signal alone is the point.
 */
export async function markGoodAction(formData: FormData): Promise<void> {
  const queueId = String(formData.get("id") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  if (!queueId) throw new Error("id required");

  const sql = requireSql();
  await sql`
    update moderation_queue
    set status='approved',
        reviewed_at=now(),
        reviewer='editor-training',
        rejected_reason=${note || null}
    where id=${queueId}
  `;

  revalidatePath("/admin");
  redirect("/admin?tab=pending&marked=good");
}

/** RESTORE a rejected item back to pending so it can be reviewed again. */
export async function restorePendingAction(formData: FormData): Promise<void> {
  const queueId = String(formData.get("id") ?? "").trim();
  if (!queueId) throw new Error("id required");

  const sql = requireSql();
  await sql`
    update moderation_queue
    set status='pending', rejected_reason=null, reviewed_at=null, reviewer=null
    where id=${queueId}
  `;

  revalidatePath("/admin");
  redirect("/admin?tab=rejected");
}

/** REJECT with a reason. */
/**
 * REROLL PHOTO — reviewer hit the "reroll photo" button on a pending
 * card. Forces the fallback chain to skip OG (since the current OG
 * photo is what they want gone) and tries Unsplash → watercolor → picsum.
 */
export async function rerollPhotoAction(formData: FormData): Promise<void> {
  const queueId = String(formData.get("id") ?? "");
  if (!queueId) throw new Error("id required");

  const sql = requireSql();
  const rows = (await sql`
    select id, source_url, city, lat, lng, english_text, original_text
    from moderation_queue where id = ${queueId} limit 1
  `) as unknown as {
    id: string;
    source_url: string | null;
    city: string | null;
    lat: number | null;
    lng: number | null;
    english_text: string | null;
    original_text: string | null;
  }[];
  if (rows.length === 0) throw new Error("queue row not found");
  const q = rows[0];

  const cityName = q.city ?? "";
  const rewriteText = (q.english_text || q.original_text || "").trim();
  const unsplashQuery = rewriteText
    ? await extractPhotoKeyword(rewriteText, cityName)
    : cityName;

  const next = await resolveHeroImage(
    q.source_url ?? "",
    queueId,
    {
      lat: q.lat,
      lng: q.lng,
      unsplashQuery,
      forceSkipOg: true
    }
  );

  await sql`update moderation_queue set photo_url = ${next} where id = ${queueId}`;
  revalidatePath("/admin");
}

export async function rejectAction(formData: FormData): Promise<void> {
  const queueId = String(formData.get("id") ?? "");
  const reason = String(formData.get("reason") ?? "no reason given").trim();
  if (!queueId) throw new Error("id required");

  const sql = requireSql();
  await sql`
    update moderation_queue
    set status='rejected',
        rejected_reason=${reason},
        reviewed_at=now(),
        reviewer='editor'
    where id=${queueId}
  `;

  revalidatePath("/admin");
  redirect("/admin?tab=pending&rejected=1");
}
