import { getCurrentStory } from "@/lib/stories";
import { formatLocal, formatUsd } from "@/lib/format";
import PencilText from "./_components/PencilText";
import MapPostmark from "./_components/MapPostmark";

export const revalidate = 3600;

function localClockString(tz: string, now: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(now);
}

function localWeekday(tz: string, now: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long"
  }).format(now);
}

/** Stable hash from an id string to a deterministic small int — used to
 *  pick a fixed tilt for each story so the Polaroid lands the same way
 *  every time.  */
function idHash(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export default async function Page() {
  const s = await getCurrentStory();
  const now = new Date();
  const rounded = new Date(
    Math.floor(now.getTime() / (60 * 60 * 1000)) * 60 * 60 * 1000
  );
  const clock = localClockString(s.timezone, rounded);
  const weekday = localWeekday(s.timezone, rounded);

  const showTranslation =
    s.original_language !== "en" && s.english_text.trim().length > 0;

  const placeParts = [s.city, s.region, s.country]
    .filter((p): p is string => !!p && p.length > 0)
    .filter((p, i, arr) => arr.indexOf(p) === i);
  const altText = `A photograph from ${placeParts.join(", ")}.`;

  // Fixed-per-story polaroid tilt in [-2.5°, +2.5°].
  const tilt = ((idHash(s.id) % 50) - 25) / 10;

  return (
    <>
      <a href="#moment" className="skip-link">
        Skip to the moment
      </a>

      <main>
        <div className="stage">
          <figure
            className="polaroid"
            style={{ "--tilt": `${tilt}deg` } as React.CSSProperties}
          >
            <div className="photo-well">
              {s.photo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  className="photo"
                  src={s.photo_url}
                  alt={altText}
                  width={1500}
                  height={1000}
                />
              ) : (
                <div className="photo photo-empty" aria-hidden="true" />
              )}
              <div className="grain" aria-hidden="true" />
              {s.lat != null && s.lng != null ? (
                <div className="postmark-slot">
                  <MapPostmark
                    lat={s.lat}
                    lng={s.lng}
                    place={`${s.city}, ${s.country}`}
                  />
                </div>
              ) : null}
            </div>
            <figcaption className="caption">
              {s.city} &middot; {weekday}
            </figcaption>
          </figure>

          <aside className="sign" aria-label="Today's prices and place">
            <div className="nail" aria-hidden="true" />
            <div className="panel">
              <div className="topline" aria-hidden="true">
                <em>Once</em>
              </div>
              <div className="head">
                <span className="city">{s.city}</span>
                <span className="dot" aria-hidden="true">·</span>
                <span className="clock">{clock}</span>
              </div>
              <div className="rule" aria-hidden="true" />
              <div className="prices">
                <div className="row">
                  <span className="label">Milk</span>
                  <span className="value">
                    {formatLocal(s.milk_price_local, s.currency_symbol)}
                  </span>
                </div>
                <div className="row">
                  <span className="label">Eggs</span>
                  <span className="value">
                    {formatLocal(s.eggs_price_local, s.currency_symbol)}
                  </span>
                </div>
              </div>
              <div className="rule" aria-hidden="true" />
              <div className="footline">
                <span className="currency">{s.currency_code}</span>
                <span className="usd">
                  {formatUsd(s.milk_price_usd)} · {formatUsd(s.eggs_price_usd)}
                </span>
              </div>
            </div>
          </aside>
        </div>

        <article id="moment" className="moment">
          <p className="greeting" aria-hidden="true">
            From {s.city}, this {weekday} &mdash;
          </p>
          <PencilText
            className="original"
            text={s.original_text}
            lang={s.original_language}
            memoryKey={s.id}
          />
          {showTranslation ? (
            <p className="translation" lang="en">
              {s.english_text}
            </p>
          ) : null}
          {s.source_url ? (
            <p className="source">
              <a href={s.source_url} target="_blank" rel="noreferrer">
                source{s.source_name ? ` · ${s.source_name}` : ""}
              </a>
            </p>
          ) : null}
        </article>

        <footer className="foot">
          <a href="/about">about</a>
        </footer>
      </main>

      <style>{`
        main {
          width: 100%;
          max-width: 1120px;
          padding: clamp(28px, 4vh, 56px) clamp(16px, 3vw, 40px);
          display: flex;
          flex-direction: column;
          gap: clamp(22px, 3vh, 36px);
          min-height: 100svh;
          opacity: 0;
          animation: enter 900ms cubic-bezier(0.22, 0.61, 0.36, 1) 80ms forwards;
        }
        @keyframes enter {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          main { opacity: 1; animation: none; transform: none; }
        }

        /* ── stage ─────────────────────────────────────────────────── */
        .stage {
          display: grid;
          grid-template-columns: 1fr minmax(180px, 220px);
          gap: clamp(24px, 4vw, 56px);
          align-items: start;
        }

        /* ── Polaroid ──────────────────────────────────────────────── */
        .polaroid {
          --tilt: 0deg;
          margin: 0;
          padding: 12px 12px 46px;
          background: #f7f0dc;
          border-radius: 2px;
          box-shadow:
            0 1px 0 rgba(32, 23, 8, 0.06),
            0 24px 44px -22px rgba(42, 23, 8, 0.38),
            inset 0 0 0 1px rgba(42, 23, 8, 0.05);
          transform: rotate(var(--tilt));
          transition: transform 600ms cubic-bezier(0.2, 0.8, 0.25, 1);
        }
        .photo-well {
          position: relative;
          overflow: hidden;
          border-radius: 1px;
        }
        .photo {
          display: block;
          width: 100%;
          height: auto;
          aspect-ratio: 3 / 2;
          object-fit: cover;
          background: var(--hairline);
          /* Slight warmth + a touch less saturation — that analog softness. */
          filter: sepia(0.08) saturate(0.92) contrast(0.99) brightness(0.98);
        }
        .photo-empty {
          background:
            repeating-linear-gradient(
              45deg,
              var(--hairline-soft) 0 12px,
              transparent 12px 24px
            );
        }
        /* Film grain layer over the photo */
        .grain {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.1  0 0 0 0 0.07  0 0 0 0 0.03  0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.38'/%3E%3C/svg%3E");
          background-size: 200px 200px;
          mix-blend-mode: multiply;
          opacity: 0.55;
        }
        .caption {
          margin-top: 14px;
          text-align: center;
          font-family: var(--cursive);
          font-size: clamp(17px, 2.1vw, 21px);
          line-height: 1;
          letter-spacing: 0.005em;
          color: var(--accent-dark);
          opacity: 0.78;
        }
        /* Watercolor postmark tucked in the photo's top-right */
        .postmark-slot {
          position: absolute;
          top: 10px;
          right: 10px;
          z-index: 2;
        }

        /* ── wooden sign ───────────────────────────────────────────── */
        .sign {
          position: relative;
          margin-top: clamp(20px, 3vh, 40px);
          transform-origin: top center;
          animation: sway 8s ease-in-out infinite;
          padding-top: 6px;
        }
        @keyframes sway {
          0%, 100% { transform: rotate(-0.5deg); }
          50%      { transform: rotate(0.3deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .sign { animation: none; transform: rotate(-0.3deg); }
        }
        .nail {
          position: absolute;
          top: 0;
          left: 50%;
          transform: translateX(-50%);
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background:
            radial-gradient(circle at 32% 30%, #6c4220 0%, #2a1708 100%);
          box-shadow:
            0 1px 2px rgba(0, 0, 0, 0.35),
            inset -1px -1px 0 rgba(255, 255, 255, 0.08);
          z-index: 3;
        }

        .panel {
          position: relative;
          padding: 16px 16px 14px;
          border-radius: 3px;
          text-align: center;
          /* Honey birch — lighter, more real-wood */
          background:
            linear-gradient(
              175deg,
              #efcf9e 0%,
              #dcb583 55%,
              #c89865 100%
            );
          /* Subtler frame + softer depth */
          box-shadow:
            0 0 0 1px rgba(120, 80, 40, 0.5),
            inset 0 0 24px rgba(80, 45, 15, 0.08),
            inset 0 -2px 0 rgba(80, 45, 15, 0.16),
            inset 0 2px 0 rgba(255, 240, 215, 0.35),
            0 10px 22px -10px rgba(80, 45, 15, 0.35);
        }
        /* grain: very subtle lines, lots of transparent space */
        .panel::before {
          content: "";
          position: absolute;
          inset: 2px;
          border-radius: inherit;
          background:
            repeating-linear-gradient(
              90deg,
              transparent 0 4px,
              rgba(100, 60, 20, 0.03) 4px 5px
            ),
            repeating-linear-gradient(
              90deg,
              transparent 0 48px,
              rgba(100, 60, 20, 0.05) 48px 50px
            );
          pointer-events: none;
          mix-blend-mode: multiply;
        }
        /* faint knot asymmetry */
        .panel::after {
          content: "";
          position: absolute;
          top: 22%;
          left: -8%;
          width: 22px;
          height: 22px;
          border-radius: 50%;
          background: radial-gradient(
            circle at 40% 40%,
            rgba(80, 45, 15, 0.18) 0%,
            rgba(80, 45, 15, 0) 55%
          );
          pointer-events: none;
        }

        /* Chalk-like white ink */
        .sign .topline {
          font-family: var(--cursive);
          font-style: italic;
          font-size: 12px;
          color: #5a3818;
          opacity: 0.7;
          margin-bottom: 2px;
        }
        .sign .head {
          display: flex;
          align-items: baseline;
          justify-content: center;
          gap: 8px;
          font-family: var(--chalk);
          color: #fbf3e3;
          text-shadow:
            0 0 1px rgba(0, 0, 0, 0.08),
            0 1px 0 rgba(80, 45, 15, 0.25);
          margin: 2px 0 6px;
        }
        .sign .head .city {
          font-size: clamp(16px, 1.7vw, 19px);
          letter-spacing: 0.02em;
        }
        .sign .head .dot {
          font-size: 16px;
          opacity: 0.7;
        }
        .sign .head .clock {
          font-size: clamp(15px, 1.7vw, 18px);
          letter-spacing: 0.03em;
          font-variant-numeric: tabular-nums;
        }

        .sign .rule {
          height: 1px;
          margin: 4px auto;
          width: 72%;
          background:
            linear-gradient(
              90deg,
              transparent 0%,
              rgba(80, 45, 15, 0.35) 20%,
              rgba(80, 45, 15, 0.35) 80%,
              transparent 100%
            );
        }

        .sign .prices {
          margin: 12px 6px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .sign .prices .row {
          display: flex;
          justify-content: center;
          align-items: baseline;
          gap: 10px;
          font-family: var(--chalk);
          color: #fbf3e3;
          text-shadow:
            0 0 1px rgba(0, 0, 0, 0.1),
            0 1px 0 rgba(80, 45, 15, 0.28);
        }
        .sign .prices .label {
          font-size: clamp(20px, 2.2vw, 24px);
          letter-spacing: 0.02em;
          min-width: 56px;
          text-align: right;
          opacity: 0.92;
        }
        .sign .prices .value {
          font-size: clamp(26px, 2.9vw, 32px);
          letter-spacing: 0.02em;
          font-variant-numeric: tabular-nums;
          min-width: 76px;
          text-align: left;
        }

        .sign .footline {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 0 4px;
          font-family: var(--serif);
          margin-top: 6px;
        }
        .sign .footline .currency {
          font-weight: 700;
          font-variation-settings: "opsz" 72, "wght" 700;
          font-size: 11px;
          color: #3a220c;
          letter-spacing: 0.22em;
          padding: 2px 8px;
          background: rgba(80, 45, 15, 0.08);
          border: 1px solid rgba(80, 45, 15, 0.3);
          border-radius: 2px;
        }
        .sign .footline .usd {
          font-style: italic;
          font-size: 10px;
          color: #5a3818;
          opacity: 0.8;
          letter-spacing: 0.02em;
          font-variant-numeric: tabular-nums;
        }

        /* ── moment ───────────────────────────────────────────────── */
        .moment {
          width: 100%;
          max-width: 640px;
          margin: clamp(4px, 1.5vh, 18px) auto 0;
        }
        .greeting {
          margin: 0 0 12px;
          font-family: var(--cursive);
          font-size: clamp(22px, 2.6vw, 28px);
          color: var(--accent);
          line-height: 1;
          letter-spacing: 0.005em;
        }
        .original {
          margin: 0;
          font-family: var(--serif);
          font-variation-settings: "opsz" 32, "SOFT" 50, "wght" 400;
          font-size: clamp(18px, 2vw, 22px);
          line-height: 1.5;
          color: var(--ink);
          text-wrap: pretty;
        }
        .translation {
          margin: 14px 0 0;
          font-family: var(--serif);
          font-style: italic;
          font-variation-settings: "opsz" 16, "SOFT" 100, "wght" 400;
          font-size: clamp(14px, 1.5vw, 16px);
          line-height: 1.55;
          color: var(--ink-muted);
          text-wrap: pretty;
        }
        .source {
          margin: 14px 0 0;
          font-family: var(--serif);
          font-style: italic;
          font-size: 12px;
          color: var(--ink-faint);
          letter-spacing: 0.02em;
        }
        .source a {
          text-decoration: none;
          border-bottom: 1px solid var(--hairline);
          padding-bottom: 1px;
        }
        .source a:hover {
          color: var(--accent);
          border-color: var(--accent-soft);
        }

        /* ── footer ───────────────────────────────────────────────── */
        .foot {
          margin-top: auto;
          padding-top: 8px;
          text-align: center;
          font-family: var(--serif);
          font-style: italic;
          font-size: 12px;
          color: var(--ink-faint);
        }
        .foot a { text-decoration: none; }
        .foot a:hover { color: var(--accent); }

        /* ── mobile: stack, sign smaller beside Polaroid bottom ───── */
        @media (max-width: 720px) {
          main {
            gap: 18px;
            padding: 18px 14px 28px;
          }
          .stage {
            display: block;
            position: relative;
          }
          .sign {
            position: absolute;
            bottom: -8px;
            right: -4px;
            width: 150px;
            margin: 0;
            z-index: 2;
          }
          .panel { padding: 12px 12px 10px; }
          .sign .head .city { font-size: 13px; }
          .sign .head .clock { font-size: 12.5px; }
          .sign .head .dot { font-size: 13px; }
          .sign .prices .row { gap: 8px; }
          .sign .prices .label { font-size: 16px; min-width: 36px; }
          .sign .prices .value { font-size: 20px; min-width: 52px; }
          .sign .footline .currency { font-size: 9.5px; letter-spacing: 0.2em; padding: 2px 6px; }
          .sign .footline .usd { font-size: 9px; }
          .sign .topline { font-size: 10px; }
          .postmark-slot { top: 8px; right: 8px; }
          .polaroid { padding-bottom: 36px; }
          .moment { margin-top: 120px; }
        }
      `}</style>
    </>
  );
}
