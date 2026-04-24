import { dbAvailable } from "@/lib/db";
import { currentHour } from "@/lib/stories";
import {
  loadScheduleWindow,
  loadLibrary,
  fillAutoSchedule
} from "@/lib/schedule";
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
 * "randomDummy" is a cron-populated placeholder — dragging overwrites
 * it.
 */
export default async function SchedulePage() {
  if (!dbAvailable()) {
    return <p className="empty">Database not available.</p>;
  }

  const now = currentHour();

  // Belt-and-suspenders: ensure the next 24 hours are populated so the
  // calendar never renders blank, even if the daily cron hasn't run
  // yet. fillAutoSchedule is idempotent — it skips hours that already
  // have a row (manual or auto), so this is cheap on repeat visits.
  try {
    await fillAutoSchedule(now, 24);
  } catch (err) {
    console.warn("[schedule] fillAutoSchedule failed:", (err as Error).message);
  }

  const [slots, library] = await Promise.all([
    loadScheduleWindow(now - 2, now + 25), // past 2 + now + next 24
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
