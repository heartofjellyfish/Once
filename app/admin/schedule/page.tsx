import { dbAvailable, requireSql } from "@/lib/db";
import { currentHour } from "@/lib/stories";
import { loadScheduleWindow, loadLibrary } from "@/lib/schedule";
import ScheduleBoard from "./_components/ScheduleBoard";

export const dynamic = "force-dynamic";

/**
 * /admin/schedule — calendar + drag-drop library.
 *
 * Top: horizontal calendar strip. Two past hours (for context), the
 * current hour, then the next 24 hours. UTC is authoritative; labels
 * render in America/Los_Angeles for the editor.
 *
 * Bottom: library of approved stories. Split into "fresh" (never
 * scheduled) and "used" (scheduled at least once; rendered grayed but
 * still draggable — early days of the project allow reuse).
 *
 * Drag a card from the library onto any slot in the calendar to pin
 * it to that UTC hour. Past hours are read-only. Slot showing
 * "random" is a cron-populated placeholder — dragging overwrites it.
 */
export default async function SchedulePage() {
  if (!dbAvailable()) {
    return <p className="empty">Database not available.</p>;
  }

  // Auto-fill the next 24 hours on first visit if the cron hasn't run
  // yet — keeps the calendar non-blank for the very first time.
  const sql = requireSql();
  const { rows: _existing } = (await (async () => {
    try {
      // Only fill if the table is empty for the window — otherwise
      // respect whatever's already in there (manual or auto).
      const now = currentHour();
      const r = (await sql`
        select count(*)::int as n from publish_schedule
        where hour_utc >= ${now} and hour_utc < ${now + 24}
      `) as unknown as { n: number }[];
      if ((r[0]?.n ?? 0) === 0) {
        const { fillAutoSchedule } = await import("@/lib/schedule");
        await fillAutoSchedule(now, 24);
      }
    } catch (err) {
      console.warn("[schedule] pre-fill failed:", (err as Error).message);
    }
    return { rows: [] };
  })());

  const now = currentHour();
  const from = now - 2;
  const to = now + 25; // past 2 + now + next 24
  const [slots, library] = await Promise.all([
    loadScheduleWindow(from, to),
    loadLibrary()
  ]);

  return (
    <ScheduleBoard
      nowHour={now}
      slots={slots}
      fresh={library.fresh}
      used={library.used}
    />
  );
}
