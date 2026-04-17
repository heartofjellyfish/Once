"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSql } from "@/lib/db";
import { curate } from "@/lib/curate";
import { runIngest } from "@/lib/pipeline";
import { currentHour } from "@/lib/stories";

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
 * INGEST — paste raw source, AI produces a candidate, lands in queue.
 */
export async function ingestAction(formData: FormData): Promise<void> {
  const sourceText = String(formData.get("source_text") ?? "").trim();
  const cityHint = String(formData.get("city_hint") ?? "").trim();
  const sourceUrl = String(formData.get("source_url") ?? "").trim();

  if (sourceText.length < 10) {
    throw new Error("Source text is too short.");
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

/** COMPOSE — manual entry, no AI, goes straight to published. */
export async function composeAction(formData: FormData): Promise<void> {
  const f = (k: string) => String(formData.get(k) ?? "").trim();
  const n = (k: string) => Number(formData.get(k) ?? 0);

  const city = f("city");
  const country = f("country");
  if (!city || !country) throw new Error("city and country are required");

  const id = `${slug(city)}-${shortId()}`;

  const sql = requireSql();
  await sql`
    insert into stories (
      id, photo_url, country, region, city, timezone, local_hour,
      original_language, original_text, english_text,
      currency_code, currency_symbol,
      milk_price_local, eggs_price_local,
      milk_price_usd, eggs_price_usd,
      source_url, source_name
    ) values (
      ${id}, ${f("photo_url") || null}, ${country}, ${f("region") || null},
      ${city}, ${f("timezone")}, ${Number(f("local_hour")) || 12},
      ${f("original_language")}, ${f("original_text")}, ${f("english_text")},
      ${f("currency_code")}, ${f("currency_symbol")},
      ${n("milk_price_local")}, ${n("eggs_price_local")},
      ${n("milk_price_usd")}, ${n("eggs_price_usd")},
      ${f("source_url") || null}, ${f("source_name") || null}
    )
  `;

  revalidatePath("/");
  revalidatePath("/admin");
  redirect("/admin");
}

/** APPROVE — promote a queue item to the published stories table. */
export async function approveAction(formData: FormData): Promise<void> {
  const queueId = String(formData.get("id") ?? "");
  if (!queueId) throw new Error("id required");

  const sql = requireSql();

  // Read with optional edits from the approval form (all fields honoured).
  const latRaw = formData.get("lat");
  const lngRaw = formData.get("lng");
  const edited = {
    photo_url: String(formData.get("photo_url") ?? "").trim(),
    country: String(formData.get("country") ?? "").trim(),
    region: String(formData.get("region") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    timezone: String(formData.get("timezone") ?? "").trim(),
    local_hour: Number(formData.get("local_hour") ?? 12),
    lat: latRaw !== null && latRaw !== "" ? Number(latRaw) : null,
    lng: lngRaw !== null && lngRaw !== "" ? Number(lngRaw) : null,
    original_language: String(formData.get("original_language") ?? "").trim(),
    original_text: String(formData.get("original_text") ?? "").trim(),
    english_text: String(formData.get("english_text") ?? "").trim(),
    currency_code: String(formData.get("currency_code") ?? "").trim(),
    currency_symbol: String(formData.get("currency_symbol") ?? "").trim(),
    milk_price_local: Number(formData.get("milk_price_local") ?? 0),
    eggs_price_local: Number(formData.get("eggs_price_local") ?? 0),
    milk_price_usd: Number(formData.get("milk_price_usd") ?? 0),
    eggs_price_usd: Number(formData.get("eggs_price_usd") ?? 0),
    source_url: String(formData.get("source_url") ?? "").trim()
  };

  const missing = [
    !edited.city && "city",
    !edited.country && "country",
    !edited.timezone && "timezone",
    !edited.original_text && "original_text",
    !edited.original_language && "original_language",
    !edited.currency_code && "currency_code",
    !edited.currency_symbol && "currency_symbol",
  ].filter(Boolean);

  if (missing.length > 0) {
    redirect(
      `/admin/edit/${queueId}?err=${encodeURIComponent(
        `Fill in before publishing: ${missing.join(", ")}`
      )}`
    );
  }

  const id = `${slug(edited.city)}-${shortId()}`;

  // Carry through weather + location_summary + fetched_at from the
  // queue row so the published story keeps its context.
  const qmetaRows = (await sql`
    select weather_current, location_summary, fetched_at
    from moderation_queue where id = ${queueId}
  `) as unknown as {
    weather_current: string | null;
    location_summary: string | null;
    fetched_at: string | null;
  }[];
  const qmeta = qmetaRows[0] ?? {
    weather_current: null,
    location_summary: null,
    fetched_at: null
  };

  // Approve & publish now — always pin to the current hour so the
  // homepage shows this story immediately. Freshness rotation picks up
  // again on the next hour (selected_hour is per-hour, not persistent).
  const pinNow = true;
  const pinnedHour = currentHour();

  await sql`
    insert into stories (
      id, photo_url, country, region, city, timezone, local_hour,
      original_language, original_text, english_text,
      currency_code, currency_symbol,
      milk_price_local, eggs_price_local,
      milk_price_usd, eggs_price_usd,
      source_url, lat, lng,
      weather_current, location_summary, fetched_at,
      selected_hour
    ) values (
      ${id},
      ${edited.photo_url || null},
      ${edited.country},
      ${edited.region || null},
      ${edited.city},
      ${edited.timezone},
      ${edited.local_hour},
      ${edited.original_language},
      ${edited.original_text},
      ${edited.english_text},
      ${edited.currency_code},
      ${edited.currency_symbol},
      ${edited.milk_price_local},
      ${edited.eggs_price_local},
      ${edited.milk_price_usd},
      ${edited.eggs_price_usd},
      ${edited.source_url || null},
      ${edited.lat},
      ${edited.lng},
      ${qmeta.weather_current},
      ${qmeta.location_summary},
      ${qmeta.fetched_at},
      ${pinnedHour}
    )
  `;

  await sql`
    update moderation_queue
    set status='approved',
        published_as_id=${id},
        reviewed_at=now(),
        reviewer='editor',
        -- also save the edited fields back to the queue for audit
        photo_url=${edited.photo_url || null},
        country=${edited.country},
        region=${edited.region || null},
        city=${edited.city},
        timezone=${edited.timezone},
        local_hour=${edited.local_hour},
        lat=${edited.lat},
        lng=${edited.lng},
        original_language=${edited.original_language},
        original_text=${edited.original_text},
        english_text=${edited.english_text},
        currency_code=${edited.currency_code},
        currency_symbol=${edited.currency_symbol},
        milk_price_local=${edited.milk_price_local},
        eggs_price_local=${edited.eggs_price_local},
        milk_price_usd=${edited.milk_price_usd},
        eggs_price_usd=${edited.eggs_price_usd}
    where id=${queueId}
  `;

  // Clear any prior pin on another story for this hour so there's no
  // collision (selectStory picks whichever row has selected_hour = hour).
  await sql`
    update stories set selected_hour = null
    where selected_hour = ${pinnedHour} and id <> ${id}
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

  revalidatePath("/admin");
  if (errorMsg) {
    redirect(`/admin?ingest_err=${encodeURIComponent(errorMsg)}`);
  }
  redirect(`/admin?ingest_ok=${encodeURIComponent(summary)}`);
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
  redirect("/admin");
}
