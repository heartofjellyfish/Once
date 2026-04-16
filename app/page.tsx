import { getCurrentStory } from "@/lib/stories";
import { formatLocal, formatUsd } from "@/lib/format";

// ISR: the page recomputes once per hour.
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

export default async function Page() {
  const s = await getCurrentStory();

  // Round UTC to the current hour: the page is cached hourly, so
  // showing minute precision would lie. "19:00" is honest.
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

  const showRegion = !!s.region && s.region !== s.city;

  return (
    <>
      <a href="#moment" className="skip-link">
        Skip to the moment
      </a>

      <main>
        <div className="stage">
          <figure className="postcard">
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
          </figure>

          <aside className="sign" aria-label="Today's prices and place">
            <div className="nail" aria-hidden="true" />
            <div className="panel">
              <div className="brand" aria-hidden="true">
                <span>·</span>
                <em>Once</em>
                <span>·</span>
              </div>

              <div className="place">
                <span className="city">{s.city}</span>
                {showRegion ? (
                  <span className="region">{s.region}</span>
                ) : null}
                <span className="country">{s.country}</span>
              </div>

              <div className="dots" aria-hidden="true">
                · · ·
              </div>

              <div className="time">
                <div className="day">{weekday}</div>
                <div className="clock">{clock}</div>
              </div>

              <div className="dots" aria-hidden="true">
                · · ·
              </div>

              <dl className="prices">
                <div className="row">
                  <dt>Milk</dt>
                  <dd>{formatLocal(s.milk_price_local, s.currency_symbol)}</dd>
                </div>
                <div className="row">
                  <dt>Eggs</dt>
                  <dd>{formatLocal(s.eggs_price_local, s.currency_symbol)}</dd>
                </div>
                <div className="usd" aria-label="USD approximations">
                  {formatUsd(s.milk_price_usd)}&nbsp;·&nbsp;
                  {formatUsd(s.eggs_price_usd)}
                </div>
              </dl>

              <div className="currency-stamp">{s.currency_code}</div>
            </div>
          </aside>
        </div>

        <article id="moment" className="moment">
          <p className="greeting" aria-hidden="true">
            From {s.city}, this {weekday} &mdash;
          </p>
          <p className="original" lang={s.original_language}>
            {s.original_text}
          </p>
          {showTranslation ? (
            <p className="translation" lang="en">
              {s.english_text}
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
          max-width: 1080px;
          padding: clamp(24px, 3.5vh, 48px) clamp(16px, 3vw, 32px);
          display: flex;
          flex-direction: column;
          gap: clamp(20px, 2.8vh, 32px);
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

        /* ── stage: photo + wooden sign side by side ───────────────────── */
        .stage {
          display: grid;
          grid-template-columns: 1fr minmax(200px, 232px);
          gap: clamp(20px, 3vw, 40px);
          align-items: start;
        }

        /* ── postcard photo frame ─────────────────────────────────────── */
        .postcard {
          margin: 0;
          padding: clamp(8px, 1vw, 14px);
          background: #fbf3dd;
          border-radius: 3px;
          box-shadow:
            0 1px 0 rgba(32, 23, 8, 0.05),
            0 22px 48px -22px rgba(42, 23, 8, 0.35),
            inset 0 0 0 1px rgba(42, 23, 8, 0.04);
          transform: rotate(-0.3deg);
          transform-origin: center;
        }
        .photo {
          display: block;
          width: 100%;
          height: auto;
          aspect-ratio: 3 / 2;
          object-fit: cover;
          border-radius: 2px;
          background: var(--hairline);
        }
        .photo-empty {
          background:
            repeating-linear-gradient(
              45deg,
              var(--hairline-soft) 0 12px,
              transparent 12px 24px
            );
        }

        /* ── wooden sign ──────────────────────────────────────────────── */
        .sign {
          position: relative;
          margin-top: clamp(10px, 2vh, 24px);
          transform: rotate(-1.4deg);
          transform-origin: top center;
          padding-top: 6px;
        }
        /* a single dark nail at the top */
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
          border-radius: 4px;
          color: var(--wood-ink);
          text-align: center;
          /* warm wood gradient — sun-weathered oak */
          background:
            linear-gradient(
              174deg,
              var(--wood-light) 0%,
              var(--wood-mid) 58%,
              var(--wood-dark) 100%
            );
          /* dark frame + interior shading + drop shadow */
          box-shadow:
            0 0 0 2px var(--wood-frame),
            0 0 0 3px rgba(0, 0, 0, 0.08),
            inset 0 0 32px rgba(0, 0, 0, 0.14),
            inset 0 -3px 0 rgba(0, 0, 0, 0.22),
            inset 0 2px 0 rgba(255, 230, 200, 0.2),
            0 14px 28px -10px rgba(0, 0, 0, 0.4);
        }
        /* grain: two overlapping repeating-linear-gradients */
        .panel::before {
          content: "";
          position: absolute;
          inset: 3px;
          border-radius: inherit;
          background:
            repeating-linear-gradient(
              90deg,
              transparent 0 3px,
              rgba(60, 30, 10, 0.05) 3px 4px
            ),
            repeating-linear-gradient(
              90deg,
              transparent 0 32px,
              rgba(60, 30, 10, 0.08) 32px 34px
            );
          pointer-events: none;
          mix-blend-mode: multiply;
        }
        /* a second faint knot to break symmetry */
        .panel::after {
          content: "";
          position: absolute;
          top: 18%;
          right: -5%;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: radial-gradient(
            circle at 40% 40%,
            rgba(60, 30, 10, 0.2) 0%,
            rgba(60, 30, 10, 0) 55%
          );
          pointer-events: none;
        }

        .sign .brand {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
          font-family: var(--serif);
          font-style: italic;
          font-size: 11px;
          color: #6b4420;
          letter-spacing: 0.08em;
          opacity: 0.9;
          margin-bottom: 6px;
        }
        .sign .brand em { font-style: italic; font-weight: 500; }
        .sign .brand span { opacity: 0.6; }

        .sign .place {
          margin: 4px 0 8px;
          line-height: 1.18;
        }
        .sign .place .city {
          display: block;
          font-family: var(--serif);
          font-variation-settings: "opsz" 72, "wght" 700;
          font-weight: 700;
          font-size: clamp(17px, 1.6vw, 19px);
          color: var(--wood-ink);
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }
        .sign .place .region {
          display: block;
          font-family: var(--serif);
          font-style: italic;
          font-size: 10px;
          color: #5a3818;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          margin-top: 3px;
        }
        .sign .place .country {
          display: block;
          font-family: var(--serif);
          font-size: 10px;
          font-weight: 500;
          color: #3a220c;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          margin-top: 3px;
        }

        .sign .dots {
          color: #6b4420;
          font-size: 10px;
          letter-spacing: 0.5em;
          opacity: 0.65;
          margin: 8px 0 6px;
        }

        .sign .time { margin: 2px 0 4px; }
        .sign .time .day {
          font-family: var(--serif);
          font-style: italic;
          font-size: 11px;
          color: #5a3818;
          letter-spacing: 0.06em;
        }
        .sign .time .clock {
          font-family: var(--serif);
          font-variation-settings: "opsz" 72, "wght" 600;
          font-weight: 600;
          font-size: 28px;
          color: var(--wood-ink);
          letter-spacing: 0.03em;
          line-height: 1;
          margin-top: 2px;
          font-variant-numeric: tabular-nums oldstyle-nums;
        }

        .sign .prices {
          margin: 4px 4px 6px;
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .sign .prices .row {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          font-family: var(--serif);
          font-size: 12.5px;
          color: var(--wood-ink);
          font-variant-numeric: tabular-nums oldstyle-nums;
        }
        .sign .prices dt {
          font-style: italic;
          font-weight: 400;
          color: #3a220c;
        }
        .sign .prices dd {
          margin: 0;
          font-weight: 600;
        }
        .sign .prices .usd {
          font-family: var(--serif);
          font-style: italic;
          font-size: 10px;
          color: #5a3818;
          letter-spacing: 0.02em;
          margin-top: 3px;
          opacity: 0.75;
          text-align: center;
        }

        .sign .currency-stamp {
          margin-top: 8px;
          padding: 4px 10px;
          display: inline-block;
          font-family: var(--serif);
          font-variation-settings: "opsz" 72, "wght" 700;
          font-weight: 700;
          font-size: 10.5px;
          color: #3a220c;
          letter-spacing: 0.35em;
          background: rgba(60, 30, 10, 0.09);
          border: 1px solid rgba(60, 30, 10, 0.4);
          border-radius: 2px;
        }

        /* ── moment ───────────────────────────────────────────────────── */
        .moment {
          width: 100%;
          max-width: 640px;
          margin: clamp(4px, 1.5vh, 18px) auto 0;
        }
        .greeting {
          margin: 0 0 10px;
          font-family: var(--cursive);
          font-size: clamp(20px, 2.4vw, 26px);
          color: var(--accent);
          line-height: 1;
          letter-spacing: 0.005em;
        }
        .original {
          margin: 0;
          font-family: var(--serif);
          font-variation-settings: "opsz" 32, "SOFT" 50, "wght" 400;
          font-size: clamp(18px, 1.95vw, 22px);
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

        /* ── footer ───────────────────────────────────────────────────── */
        .foot {
          margin-top: auto;
          padding-top: 8px;
          text-align: center;
          font-family: var(--serif);
          font-style: italic;
          font-size: 12px;
          color: var(--ink-faint);
        }
        .foot a {
          text-decoration: none;
        }
        .foot a:hover {
          color: var(--accent);
        }

        /* ── mobile: sign becomes a smaller badge overlaid on the photo  */
        @media (max-width: 720px) {
          main {
            gap: 18px;
            padding: 16px 14px 24px;
          }
          .stage {
            display: block;
            position: relative;
          }
          .sign {
            position: absolute;
            top: 10px;
            right: 10px;
            width: 140px;
            margin: 0;
            transform: rotate(-2deg);
            z-index: 2;
          }
          .panel {
            padding: 12px 12px 10px;
          }
          .sign .place .city { font-size: 15px; letter-spacing: 0.1em; }
          .sign .place .region,
          .sign .place .country { font-size: 9px; letter-spacing: 0.14em; }
          .sign .time .clock { font-size: 22px; }
          .sign .time .day { font-size: 10px; }
          .sign .prices .row { font-size: 11.5px; }
          .sign .prices .usd { font-size: 9px; }
          .sign .currency-stamp { font-size: 9.5px; padding: 3px 8px; letter-spacing: 0.3em; }
          .sign .brand { font-size: 10px; }
          .sign .dots { font-size: 9px; margin: 6px 0 4px; }
        }
      `}</style>
    </>
  );
}
