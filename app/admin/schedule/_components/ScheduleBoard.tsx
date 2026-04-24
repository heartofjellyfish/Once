"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { scheduleStoryAction, unscheduleHourAction } from "@/app/admin/actions";
import type { ScheduleSlot, LibraryStory } from "@/lib/schedule";

/**
 * Format a UTC-hour integer (hours since Unix epoch) for the calendar
 * slot label. Authoritative time is UTC; we render in America/Los_Angeles
 * so the editor reads "their" time.
 */
function slotLabel(hour_utc: number): { date: string; time: string; tz: string } {
  const d = new Date(hour_utc * 60 * 60 * 1000);
  const fmtDate = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric"
  });
  const fmtHour = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    hour12: true
  });
  const fmtTzName = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    timeZoneName: "short"
  });
  const tzParts = fmtTzName.formatToParts(d);
  const tz =
    tzParts.find((p) => p.type === "timeZoneName")?.value ?? "PT";
  return { date: fmtDate.format(d), time: fmtHour.format(d), tz };
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n).trim() + "…" : s;
}

interface Props {
  nowHour: number;
  slots: ScheduleSlot[];
  fresh: LibraryStory[];
  used: LibraryStory[];
}

export default function ScheduleBoard({ nowHour, slots, fresh, used }: Props) {
  const [isPending, startTransition] = useTransition();
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropHour, setDropHour] = useState<number | null>(null);

  function handleDragStart(e: React.DragEvent, storyId: string) {
    e.dataTransfer.setData("text/story-id", storyId);
    e.dataTransfer.effectAllowed = "copy";
    setDragId(storyId);
  }

  function handleDragEnd() {
    setDragId(null);
    setDropHour(null);
  }

  function handleDragOver(e: React.DragEvent, hour: number) {
    if (hour < nowHour) return; // past slots are read-only
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDropHour(hour);
  }

  function handleDragLeave(hour: number) {
    setDropHour((cur) => (cur === hour ? null : cur));
  }

  function handleDrop(e: React.DragEvent, hour: number) {
    if (hour < nowHour) return;
    e.preventDefault();
    const storyId = e.dataTransfer.getData("text/story-id");
    setDropHour(null);
    setDragId(null);
    if (!storyId) return;
    const fd = new FormData();
    fd.set("story_id", storyId);
    fd.set("hour_utc", String(hour));
    startTransition(async () => {
      await scheduleStoryAction(fd);
    });
  }

  function handleUnschedule(hour: number) {
    const fd = new FormData();
    fd.set("hour_utc", String(hour));
    startTransition(async () => {
      await unscheduleHourAction(fd);
    });
  }

  return (
    <div>
      <header className="head">
        <h1>schedule</h1>
        <p className="hint">
          drag a card from the library onto a future slot. past = read-only.
          <strong className="dim"> random</strong> = cron auto-fill, will be
          overwritten when you drop something on it. times shown in PT; stored
          as UTC.
        </p>
      </header>

      <section className={`strip ${isPending ? "pending" : ""}`}>
        {slots.map((s) => {
          const { date, time, tz } = slotLabel(s.hour_utc);
          const isPast = s.hour_utc < nowHour;
          const isNow = s.hour_utc === nowHour;
          const isFuture = s.hour_utc > nowHour;
          const isDropTarget = dropHour === s.hour_utc;

          return (
            <div
              key={s.hour_utc}
              className={[
                "slot",
                isPast ? "past" : "",
                isNow ? "now" : "",
                isFuture ? "future" : "",
                isDropTarget ? "drop" : "",
                s.source === "randomDummyStory" ? "random" : "manual"
              ].join(" ")}
              onDragOver={(e) => handleDragOver(e, s.hour_utc)}
              onDragLeave={() => handleDragLeave(s.hour_utc)}
              onDrop={(e) => handleDrop(e, s.hour_utc)}
            >
              <div className="slot-time">
                <span className="slot-day">{date}</span>
                <span className="slot-hour">
                  {time}
                  <span className="slot-tz">{tz}</span>
                </span>
                {isNow ? <span className="now-tag">NOW</span> : null}
              </div>

              {s.story ? (
                <>
                  {s.story.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.story.photo_url}
                      alt=""
                      className="slot-photo"
                    />
                  ) : (
                    <div className="slot-photo slot-photo-empty" />
                  )}
                  <div className="slot-city">
                    {[s.story.city, s.story.country]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                  <div className="slot-text" lang={s.story.original_language ?? undefined}>
                    {truncate(s.story.english_text || s.story.original_text, 80)}
                  </div>
                  <div className="slot-foot">
                    <span className={`src-tag src-${s.source}`}>
                      {s.source === "manualApprovedStory"
                        ? "humanApproved"
                        : "randomDummy"}
                    </span>
                    {!isPast ? (
                      <button
                        type="button"
                        className="unschedule"
                        onClick={() => handleUnschedule(s.hour_utc)}
                        title="clear this slot; cron will re-fill with a random pick"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="slot-empty">
                  <span>empty</span>
                  {!isPast ? (
                    <small>drop a card to fill</small>
                  ) : (
                    <small>nothing was shown</small>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="library">
        <div className="lib-head">
          <h2>library</h2>
          <span className="dim">
            {fresh.length} fresh · {used.length} used
          </span>
        </div>

        {fresh.length === 0 && used.length === 0 ? (
          <p className="empty">
            No approved stories yet. Approve some from{" "}
            <Link href="/admin">queue</Link>.
          </p>
        ) : null}

        {fresh.length > 0 ? (
          <>
            <h3 className="lib-sub">fresh — never scheduled</h3>
            <div className="cards">
              {fresh.map((st) => (
                <LibraryCard
                  key={st.id}
                  story={st}
                  used={false}
                  dragging={dragId === st.id}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          </>
        ) : null}

        {used.length > 0 ? (
          <>
            <h3 className="lib-sub">used — already shown, still draggable</h3>
            <div className="cards used">
              {used.map((st) => (
                <LibraryCard
                  key={st.id}
                  story={st}
                  used={true}
                  dragging={dragId === st.id}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              ))}
            </div>
          </>
        ) : null}
      </section>

      <style>{`
        .head { margin-bottom: 18px; }
        .head h1 {
          font-family: var(--serif);
          font-weight: 500;
          margin: 0 0 6px;
          font-size: 22px;
        }
        .hint {
          font-size: 12px;
          color: var(--ink-muted);
          margin: 0;
          line-height: 1.5;
          max-width: 700px;
        }
        .hint .dim { color: var(--ink-faint); font-weight: normal; }

        .strip {
          display: flex;
          gap: 10px;
          overflow-x: auto;
          padding: 14px 2px 22px;
          margin-bottom: 28px;
          border-top: 1px solid var(--hairline);
          border-bottom: 1px solid var(--hairline);
          scroll-snap-type: x proximity;
        }
        .strip.pending { opacity: 0.7; }

        .slot {
          flex: 0 0 180px;
          border: 1px solid var(--hairline);
          border-radius: 4px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-size: 11.5px;
          background: var(--bg);
          scroll-snap-align: start;
          min-height: 200px;
        }
        .slot.past { opacity: 0.55; background: transparent; }
        .slot.now {
          border-color: var(--ink);
          box-shadow: 0 0 0 2px var(--ink);
        }
        .slot.future.random { background: rgba(0,0,0,0.015); }
        .slot.future.manual {
          border-color: rgba(109, 140, 72, 0.5);
          background: rgba(109, 140, 72, 0.05);
        }
        .slot.drop {
          border-color: #8a3520;
          background: rgba(168, 90, 60, 0.08);
          border-style: dashed;
        }

        .slot-time {
          display: flex;
          align-items: baseline;
          gap: 6px;
          flex-wrap: wrap;
        }
        .slot-day {
          font-family: var(--mono);
          font-size: 10px;
          color: var(--ink-faint);
          letter-spacing: 0.04em;
        }
        .slot-hour {
          font-family: var(--mono);
          font-size: 12px;
          font-weight: 500;
          color: var(--ink);
          font-variant-numeric: tabular-nums;
        }
        .slot-tz {
          font-size: 9px;
          color: var(--ink-faint);
          margin-left: 3px;
        }
        .now-tag {
          font-family: var(--sans);
          font-size: 9px;
          letter-spacing: 0.14em;
          background: var(--ink);
          color: var(--bg);
          padding: 1px 5px;
          border-radius: 2px;
          margin-left: auto;
        }

        .slot-photo {
          width: 100%;
          height: 80px;
          object-fit: cover;
          border-radius: 3px;
          filter: sepia(0.25) saturate(0.82);
        }
        .slot-photo-empty {
          background: repeating-linear-gradient(
            45deg,
            var(--hairline) 0 6px,
            transparent 6px 12px
          );
        }

        .slot-city {
          font-family: var(--sans);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ink-muted);
        }
        .slot-text {
          font-family: var(--serif);
          font-size: 12px;
          line-height: 1.35;
          color: var(--ink);
          flex: 1;
        }
        .slot-foot {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .src-tag {
          font-family: var(--mono);
          font-size: 9px;
          letter-spacing: 0.05em;
          padding: 1px 5px;
          border-radius: 2px;
        }
        .src-tag.src-manualApprovedStory {
          background: rgba(109, 140, 72, 0.2);
          color: #3f5e28;
        }
        .src-tag.src-randomDummyStory {
          background: var(--hairline);
          color: var(--ink-faint);
        }
        .unschedule {
          font-family: var(--sans);
          border: 1px solid var(--hairline);
          background: transparent;
          color: var(--ink-faint);
          width: 20px;
          height: 20px;
          border-radius: 2px;
          cursor: pointer;
          line-height: 1;
          padding: 0;
          letter-spacing: 0;
          text-transform: none;
          font-size: 14px;
        }
        .unschedule:hover { color: var(--ink); background: var(--hairline); }

        .slot-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          color: var(--ink-faint);
          font-family: var(--mono);
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border: 1px dashed var(--hairline);
          border-radius: 3px;
          padding: 10px;
        }
        .slot-empty small {
          font-size: 9px;
          color: var(--ink-faint);
          opacity: 0.7;
          text-transform: none;
          letter-spacing: 0;
        }

        .library h2 {
          font-family: var(--serif);
          font-weight: 500;
          margin: 0;
          font-size: 18px;
        }
        .lib-head {
          display: flex;
          align-items: baseline;
          gap: 14px;
          margin-bottom: 14px;
        }
        .lib-head .dim {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--ink-faint);
        }
        .lib-sub {
          font-family: var(--sans);
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ink-muted);
          margin: 16px 0 10px;
          font-weight: 400;
        }
        .cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 10px;
        }
        .cards.used .lib-card { opacity: 0.55; filter: saturate(0.7); }
        .empty { color: var(--ink-muted); font-size: 13px; }
      `}</style>
    </div>
  );
}

interface CardProps {
  story: LibraryStory;
  used: boolean;
  dragging: boolean;
  onDragStart: (e: React.DragEvent, storyId: string) => void;
  onDragEnd: () => void;
}

function LibraryCard({
  story,
  used,
  dragging,
  onDragStart,
  onDragEnd
}: CardProps) {
  return (
    <div
      className={`lib-card ${dragging ? "is-dragging" : ""} ${used ? "is-used" : ""}`}
      draggable
      onDragStart={(e) => onDragStart(e, story.id)}
      onDragEnd={onDragEnd}
      title={used ? `used ${story.used_count}×` : "never scheduled"}
    >
      {story.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={story.photo_url} alt="" className="lc-photo" />
      ) : (
        <div className="lc-photo lc-photo-empty" />
      )}
      <div className="lc-body">
        <div className="lc-city">
          {[story.city, story.country].filter(Boolean).join(" · ")}
          {used ? (
            <span className="lc-used">×{story.used_count}</span>
          ) : null}
        </div>
        <div className="lc-text" lang={story.original_language ?? undefined}>
          {truncate(story.english_text || story.original_text, 100)}
        </div>
      </div>

      <style>{`
        .lib-card {
          display: flex;
          gap: 10px;
          padding: 8px;
          border: 1px solid var(--hairline);
          border-radius: 4px;
          background: var(--bg);
          cursor: grab;
          user-select: none;
          transition: transform 80ms, box-shadow 80ms;
        }
        .lib-card:hover {
          box-shadow: 0 2px 6px rgba(0,0,0,0.06);
          transform: translateY(-1px);
        }
        .lib-card:active { cursor: grabbing; }
        .lib-card.is-dragging { opacity: 0.45; }

        .lc-photo {
          width: 60px;
          height: 60px;
          object-fit: cover;
          border-radius: 3px;
          filter: sepia(0.25) saturate(0.82);
          flex-shrink: 0;
        }
        .lc-photo-empty {
          background: repeating-linear-gradient(
            45deg,
            var(--hairline) 0 4px,
            transparent 4px 8px
          );
        }
        .lc-body {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 3px;
          min-width: 0;
        }
        .lc-city {
          font-family: var(--sans);
          font-size: 9.5px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ink-muted);
          display: flex;
          gap: 6px;
          align-items: baseline;
        }
        .lc-used {
          font-family: var(--mono);
          font-size: 9px;
          color: var(--ink-faint);
          letter-spacing: 0;
        }
        .lc-text {
          font-family: var(--serif);
          font-size: 12px;
          line-height: 1.35;
          color: var(--ink);
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 3;
          -webkit-box-orient: vertical;
        }
      `}</style>
    </div>
  );
}
