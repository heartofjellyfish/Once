/**
 * End-to-end smoke for the publish_schedule feature.
 *
 *   npx tsx scripts/smoke-schedule.ts
 *
 * Checks:
 *   1. Table exists / can be created (ensureScheduleTable)
 *   2. fillAutoSchedule inserts randomDummyStory rows for empty hours
 *   3. loadScheduleWindow returns contiguous slots with joined stories
 *   4. loadLibrary splits fresh vs used correctly
 *   5. setSchedule upserts a manualApprovedStory (overwrites auto)
 *   6. getScheduledStoryId returns the manual pick
 *   7. getCurrentStory on the homepage honours the schedule
 *   8. clearSchedule deletes the row; next getScheduledStoryId returns null
 *
 * Leaves the DB in roughly the state it started (manual test rows are
 * cleared; auto-fills are kept since that's what cron would do).
 */
import { requireSql } from "@/lib/db";
import { currentHour, getCurrentStory } from "@/lib/stories";
import {
  ensureScheduleTable,
  fillAutoSchedule,
  loadScheduleWindow,
  loadLibrary,
  setSchedule,
  getScheduledStoryId,
  clearSchedule
} from "@/lib/schedule";

function log(step: string, ok: boolean, detail: string = "") {
  const mark = ok ? "✓" : "✗";
  console.log(`${mark} ${step}${detail ? " — " + detail : ""}`);
  if (!ok) process.exitCode = 1;
}

async function main() {
  const sql = requireSql();
  const now = currentHour();

  // 1. ensureScheduleTable
  await ensureScheduleTable();
  const tableCheck = (await sql`
    select to_regclass('public.publish_schedule')::text as t
  `) as unknown as { t: string | null }[];
  log("1. publish_schedule table exists", tableCheck[0]?.t === "publish_schedule",
      `→ ${tableCheck[0]?.t}`);

  // Pick a fresh test-only future hour far enough out that the editor
  // wouldn't touch it manually (48h from now).
  const testHour = now + 48;

  // Start clean for the test hour.
  await clearSchedule(testHour);

  // 2. fillAutoSchedule
  const fillRes = await fillAutoSchedule(now, 24);
  const filledRows = (await sql`
    select count(*)::int as n
    from publish_schedule
    where hour_utc >= ${now} and hour_utc < ${now + 24}
      and source = 'randomDummyStory'
  `) as unknown as { n: number }[];
  log("2. fillAutoSchedule ran",
      filledRows[0].n > 0 || fillRes.skipped > 0,
      `filled=${fillRes.filled} skipped=${fillRes.skipped} rows-in-window=${filledRows[0].n}`);

  // 3. loadScheduleWindow
  const slots = await loadScheduleWindow(now - 2, now + 25);
  const expectLen = 27;
  log("3. loadScheduleWindow returns 27 contiguous slots",
      slots.length === expectLen,
      `got ${slots.length}`);
  const hasAnyStory = slots.some((s) => s.story != null);
  log("   · at least one slot has a joined story",
      hasAnyStory,
      `${slots.filter((s) => s.story).length}/${slots.length} filled`);

  // 4. loadLibrary
  const lib = await loadLibrary();
  log("4. loadLibrary returns lists",
      Array.isArray(lib.fresh) && Array.isArray(lib.used),
      `fresh=${lib.fresh.length} used=${lib.used.length}`);

  const anyStory = lib.fresh[0] ?? lib.used[0];
  if (!anyStory) {
    log("   · stories table has content", false, "no stories at all — cannot continue");
    return;
  }

  // 5. setSchedule — drag a story onto testHour
  await setSchedule(testHour, anyStory.id, "manualApprovedStory", "smoke-test");
  const row = (await sql`
    select story_id::text as story_id, source
    from publish_schedule where hour_utc = ${testHour}
  `) as unknown as { story_id: string; source: string }[];
  log("5. setSchedule wrote manualApprovedStory",
      row[0]?.story_id === anyStory.id && row[0]?.source === "manualApprovedStory",
      `story_id=${row[0]?.story_id} source=${row[0]?.source}`);

  // 5b. Overwrite: setSchedule again with same hour, different source to
  //     verify upsert logic (simulates cron auto-fill running BEFORE editor drag).
  await setSchedule(testHour, anyStory.id, "manualApprovedStory", "smoke-test-v2");
  const row2 = (await sql`
    select scheduled_by from publish_schedule where hour_utc = ${testHour}
  `) as unknown as { scheduled_by: string }[];
  log("   · upsert updates scheduled_by on conflict",
      row2[0]?.scheduled_by === "smoke-test-v2",
      `scheduled_by=${row2[0]?.scheduled_by}`);

  // 6. getScheduledStoryId
  const fetchedId = await getScheduledStoryId(testHour);
  log("6. getScheduledStoryId round-trips",
      fetchedId === anyStory.id,
      `want=${anyStory.id} got=${fetchedId}`);

  // 7. getCurrentStory — plant a manual schedule at the CURRENT hour
  //    and confirm the homepage selector returns it.
  const prevAtNow = await getScheduledStoryId(now);
  await setSchedule(now, anyStory.id, "manualApprovedStory", "smoke-test");
  const live = await getCurrentStory();
  log("7. getCurrentStory honours publish_schedule at now",
      live.id === anyStory.id,
      `homepage returned ${live.id}, wanted ${anyStory.id}`);

  // Restore the previous row at `now` (or clear if nothing was there).
  if (prevAtNow) {
    await setSchedule(now, prevAtNow, "randomDummyStory", "smoke-test-restore");
  } else {
    await clearSchedule(now);
  }

  // 8. clearSchedule
  await clearSchedule(testHour);
  const cleared = await getScheduledStoryId(testHour);
  log("8. clearSchedule deletes the row",
      cleared === null,
      `after delete: ${cleared}`);

  // 9. Bonus: verify that an hour with a NULL story_id (simulated: story
  //    was deleted) falls through correctly.
  await sql`
    insert into publish_schedule (hour_utc, story_id, source, scheduled_by)
    values (${testHour}, null, 'randomDummyStory', 'smoke-null-test')
    on conflict (hour_utc) do update set story_id = null
  `;
  const nullFetch = await getScheduledStoryId(testHour);
  log("9. null story_id in schedule returns null (→ drift fallback)",
      nullFetch === null,
      `got ${nullFetch}`);
  await clearSchedule(testHour);

  console.log("\ndone.");
}

main().catch((err) => {
  console.error("smoke failed:", err);
  process.exit(1);
});
