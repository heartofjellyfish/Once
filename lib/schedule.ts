/**
 * Publish schedule — UTC hour → story_id on the homepage.
 *
 * Two sources:
 *   - manualApprovedStory: the editor dragged an approved story into a
 *     future slot on /admin/schedule. Authoritative.
 *   - randomDummyStory: the daily cron pre-filled this hour with a
 *     random pick from the approved library. Placeholder so the
 *     homepage always has something; overwritten by editor drag.
 *
 * This table replaces the old `stories.selected_hour` pin mechanism.
 * The homepage selector (lib/stories.ts → getCurrentStory) reads this
 * first; the drift fallback remains as a final safety net only.
 */
import { requireSql } from "./db";
import { currentHour } from "./stories";
import type { Story } from "./types";

export type ScheduleSource = "manualApprovedStory" | "randomDummyStory";

export interface ScheduleRow {
  hour_utc: number;
  story_id: string | null;
  source: ScheduleSource;
  scheduled_at: string;
  scheduled_by: string | null;
}

export interface ScheduleSlot extends ScheduleRow {
  story: Story | null;
}

/**
 * Lazily add the publish_schedule table on first read/write so fresh
 * Neon databases don't error before a migration runs. Mirrors the
 * pattern used by lib/ogImage.ts's ensurePhotoColumns().
 */
let _ensured = false;
export async function ensureScheduleTable(): Promise<void> {
  if (_ensured) return;
  const sql = requireSql();
  await sql`
    create table if not exists publish_schedule (
      hour_utc       bigint primary key,
      story_id       text references stories(id) on delete set null,
      source         text not null check (source in ('manualApprovedStory','randomDummyStory')),
      scheduled_at   timestamptz not null default now(),
      scheduled_by   text
    )
  `;
  await sql`
    create index if not exists publish_schedule_story_idx
      on publish_schedule (story_id)
  `;
  _ensured = true;
}

/**
 * Load the story_id that should appear at the given UTC hour. Returns
 * null if nothing is scheduled (homepage falls back to drift).
 */
export async function getScheduledStoryId(hour: number): Promise<string | null> {
  await ensureScheduleTable();
  const sql = requireSql();
  const rows = (await sql`
    select story_id::text as story_id
    from publish_schedule
    where hour_utc = ${hour}
    limit 1
  `) as unknown as { story_id: string | null }[];
  return rows[0]?.story_id ?? null;
}

/**
 * Write a schedule row. Upserts on hour_utc so dragging onto a slot
 * that already had a randomDummyStory overwrites it cleanly.
 */
export async function setSchedule(
  hour: number,
  storyId: string,
  source: ScheduleSource,
  scheduledBy: string
): Promise<void> {
  await ensureScheduleTable();
  const sql = requireSql();
  await sql`
    insert into publish_schedule (hour_utc, story_id, source, scheduled_by)
    values (${hour}, ${storyId}, ${source}, ${scheduledBy})
    on conflict (hour_utc) do update set
      story_id = excluded.story_id,
      source = excluded.source,
      scheduled_at = now(),
      scheduled_by = excluded.scheduled_by
  `;
}

/** Remove the row at an hour (lets cron re-fill with a random pick). */
export async function clearSchedule(hour: number): Promise<void> {
  await ensureScheduleTable();
  const sql = requireSql();
  await sql`delete from publish_schedule where hour_utc = ${hour}`;
}

/**
 * Pick a random approved story for dummy fill. Prefers stories that
 * have never appeared on the schedule before; if every approved story
 * has been used, falls back to uniform random over all approved.
 */
async function pickRandomStoryId(): Promise<string | null> {
  const sql = requireSql();
  const unused = (await sql`
    select s.id::text as id
    from stories s
    where not exists (
      select 1 from publish_schedule p where p.story_id = s.id
    )
    order by random()
    limit 1
  `) as unknown as { id: string }[];
  if (unused[0]) return unused[0].id;

  const any = (await sql`
    select id::text as id from stories
    order by random() limit 1
  `) as unknown as { id: string }[];
  return any[0]?.id ?? null;
}

/**
 * Pre-fill the next `hours` hours (starting from `startHour`, inclusive)
 * with randomDummyStory where no row exists yet. Called by the daily
 * cron after ingest completes. Existing rows (manual or auto) are left
 * alone. Returns how many new rows were inserted.
 */
export async function fillAutoSchedule(
  startHour: number = currentHour(),
  hours: number = 24
): Promise<{ filled: number; skipped: number }> {
  await ensureScheduleTable();
  const sql = requireSql();

  const existing = (await sql`
    select hour_utc::int8 as hour_utc
    from publish_schedule
    where hour_utc >= ${startHour} and hour_utc < ${startHour + hours}
  `) as unknown as { hour_utc: number }[];
  const taken = new Set(existing.map((r) => Number(r.hour_utc)));

  let filled = 0;
  let skipped = 0;
  for (let h = startHour; h < startHour + hours; h++) {
    if (taken.has(h)) {
      skipped++;
      continue;
    }
    const storyId = await pickRandomStoryId();
    if (!storyId) break; // nothing to pick — library empty
    await sql`
      insert into publish_schedule (hour_utc, story_id, source, scheduled_by)
      values (${h}, ${storyId}, 'randomDummyStory', 'cron')
      on conflict (hour_utc) do nothing
    `;
    filled++;
  }
  return { filled, skipped };
}

/**
 * Load a contiguous window of schedule rows with the joined story.
 * Used by /admin/schedule to render the calendar strip.
 *
 * Range is [fromHour, toHour), both ints. Rows for empty slots are
 * synthesised with story_id=null — so the caller gets exactly
 * `toHour - fromHour` entries.
 */
export async function loadScheduleWindow(
  fromHour: number,
  toHour: number
): Promise<ScheduleSlot[]> {
  await ensureScheduleTable();
  const sql = requireSql();

  const rows = (await sql`
    select
      p.hour_utc::int8 as hour_utc,
      p.story_id::text as story_id,
      p.source,
      p.scheduled_at::text as scheduled_at,
      p.scheduled_by,
      s.id::text            as s_id,
      s.photo_url           as s_photo_url,
      s.country             as s_country,
      s.region              as s_region,
      s.city                as s_city,
      s.timezone            as s_timezone,
      s.local_hour          as s_local_hour,
      s.original_language   as s_original_language,
      s.original_text       as s_original_text,
      s.english_text        as s_english_text
    from publish_schedule p
    left join stories s on s.id = p.story_id
    where p.hour_utc >= ${fromHour} and p.hour_utc < ${toHour}
    order by p.hour_utc asc
  `) as unknown as Array<{
    hour_utc: number;
    story_id: string | null;
    source: ScheduleSource;
    scheduled_at: string;
    scheduled_by: string | null;
    s_id: string | null;
    s_photo_url: string | null;
    s_country: string | null;
    s_region: string | null;
    s_city: string | null;
    s_timezone: string | null;
    s_local_hour: number | null;
    s_original_language: string | null;
    s_original_text: string | null;
    s_english_text: string | null;
  }>;

  const byHour = new Map<number, ScheduleSlot>();
  for (const r of rows) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const story: Story | null = r.s_id
      ? ({
          id: r.s_id,
          photo_url: r.s_photo_url,
          country: r.s_country,
          region: r.s_region,
          city: r.s_city,
          timezone: r.s_timezone,
          local_hour: r.s_local_hour,
          original_language: r.s_original_language,
          original_text: r.s_original_text,
          english_text: r.s_english_text
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
      : null;
    byHour.set(Number(r.hour_utc), {
      hour_utc: Number(r.hour_utc),
      story_id: r.story_id,
      source: r.source,
      scheduled_at: r.scheduled_at,
      scheduled_by: r.scheduled_by,
      story
    });
  }

  const out: ScheduleSlot[] = [];
  for (let h = fromHour; h < toHour; h++) {
    out.push(
      byHour.get(h) ?? {
        hour_utc: h,
        story_id: null,
        source: "randomDummyStory",
        scheduled_at: "",
        scheduled_by: null,
        story: null
      }
    );
  }
  return out;
}

/**
 * Load the library of approved stories (for the /admin/schedule page).
 * Split into fresh (never scheduled) and used (scheduled at least
 * once). UI grays out the "used" group but keeps them draggable.
 */
export interface LibraryStory {
  id: string;
  photo_url: string | null;
  city: string | null;
  country: string | null;
  original_text: string | null;
  english_text: string | null;
  original_language: string | null;
  published_at: string | null;
  used_count: number;
}

export async function loadLibrary(): Promise<{
  fresh: LibraryStory[];
  used: LibraryStory[];
}> {
  await ensureScheduleTable();
  const sql = requireSql();
  const rows = (await sql`
    select
      s.id::text as id,
      s.photo_url, s.city, s.country,
      s.original_text, s.english_text, s.original_language,
      s.published_at::text as published_at,
      coalesce(
        (select count(*)::int from publish_schedule p where p.story_id = s.id),
        0
      ) as used_count
    from stories s
    order by s.published_at desc
    limit 500
  `) as unknown as LibraryStory[];

  const fresh: LibraryStory[] = [];
  const used: LibraryStory[] = [];
  for (const r of rows) {
    if ((r.used_count ?? 0) === 0) fresh.push(r);
    else used.push(r);
  }
  return { fresh, used };
}
