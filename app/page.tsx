import { getCurrentStory } from "@/lib/stories";
import { formatLocal, formatUsd } from "@/lib/format";
import PencilText from "./_components/PencilText";
import MapPostmark from "./_components/MapPostmark";
import EnvelopeIntro from "./_components/EnvelopeIntro";

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

/** Stable per-id hash used for Polaroid tilt so same story always lands the same way. */
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

  const hash = idHash(s.id);
  const tilt = ((hash % 50) - 25) / 10; // -2.5°..+2.5°
  const noteTilt = ((hash % 40) / 10 - 2).toFixed(2); // -2°..+2° different seed feel

  return (
    <>
      <a href="#moment" className="skip-link">
        Skip to the moment
      </a>

      <EnvelopeIntro
        city={s.city}
        country={s.country}
        lat={s.lat ?? null}
        lng={s.lng ?? null}
      />

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
            </div>
            <figcaption className="caption">
              {s.city} &middot; {weekday}
            </figcaption>
          </figure>

          <div className="right-column">
            {s.lat != null && s.lng != null ? (
              <div className="stamp-wrap">
                <MapPostmark
                  lat={s.lat}
                  lng={s.lng}
                  city={s.city}
                  country={s.country}
                  width={108}
                />
              </div>
            ) : null}

            <aside
              className="note"
              aria-label="Today's prices and place"
              style={{ "--note-tilt": `${noteTilt}deg` } as React.CSSProperties}
            >
              <div className="paper">
              <div className="topline">
                <span className="city">{s.city}</span>
                <span className="sep" aria-hidden="true">·</span>
                <span className="clock">{clock}</span>
              </div>
              <div className="rule" aria-hidden="true">
                &mdash; · &mdash;
              </div>
              <div className="prices">
                <div className="row">
                  <span className="label">milk</span>
                  <span className="dots" aria-hidden="true" />
                  <span className="value">
                    {formatLocal(s.milk_price_local, s.currency_symbol)}
                  </span>
                </div>
                <div className="row">
                  <span className="label">eggs</span>
                  <span className="dots" aria-hidden="true" />
                  <span className="value">
                    {formatLocal(s.eggs_price_local, s.currency_symbol)}
                  </span>
                </div>
              </div>
              <div className="footline">
                <span className="currency">{s.currency_code}</span>
                <span className="usd">
                  {formatUsd(s.milk_price_usd)}&nbsp;·&nbsp;
                  {formatUsd(s.eggs_price_usd)}
                </span>
              </div>
            </div>
          </aside>
          </div>
        </div>

        <article id="moment" className="moment">
          <p className="greeting" aria-hidden="true">
            From {s.city}, this {weekday} &mdash;
          </p>
          <PencilText
            className="original"
            text={s.original_text}
            lang={s.original_language}
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

        .stage {
          display: grid;
          grid-template-columns: 1fr minmax(170px, 210px);
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
          /* Earthtone unification: pull all photos into a warm sepia. */
          filter: sepia(0.35) saturate(0.78) contrast(0.97) brightness(0.97);
        }
        .photo-empty {
          background:
            repeating-linear-gradient(
              45deg,
              var(--hairline-soft) 0 12px,
              transparent 12px 24px
            );
        }
        .grain {
          position: absolute;
          inset: 0;
          pointer-events: none;
          background-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.1  0 0 0 0 0.07  0 0 0 0 0.03  0 0 0 0.5 0'/%3E%3C/filter%3E%3Crect width='200' height='200' filter='url(%23n)' opacity='0.38'/%3E%3C/svg%3E");
          background-size: 200px 200px;
          mix-blend-mode: multiply;
          opacity: 0.5;
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
        /* ── right column: stamp on top, handwritten note below ────── */
        .right-column {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: clamp(18px, 3vh, 32px);
          padding-top: clamp(8px, 1.5vh, 18px);
        }
        .stamp-wrap {
          align-self: center;
        }

        /* ── handwritten note (replaces wooden sign) ──────────────── */
        .note {
          --note-tilt: 1deg;
          transform: rotate(var(--note-tilt));
          transform-origin: top center;
          width: 100%;
        }
        .note .paper {
          position: relative;
          padding: 18px 18px 14px;
          background: #f1e7cb;
          background-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.6' numOctaves='1' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0.22  0 0 0 0 0.14  0 0 0 0 0.06  0 0 0 0.2 0'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");
          background-blend-mode: multiply;
          border-radius: 1.5px;
          box-shadow:
            0 1px 0 rgba(32, 23, 8, 0.06),
            0 14px 26px -16px rgba(42, 23, 8, 0.3),
            inset 0 0 0 0.5px rgba(34, 27, 18, 0.1);
        }

        .note .topline {
          display: flex;
          align-items: baseline;
          justify-content: center;
          gap: 10px;
          font-family: var(--cursive);
          font-size: clamp(14px, 1.5vw, 16px);
          color: var(--ink-soft);
          letter-spacing: 0.01em;
        }
        .note .topline .sep { color: var(--ink-faint); }
        .note .topline .clock {
          font-variant-numeric: tabular-nums;
        }

        .note .rule {
          text-align: center;
          color: var(--ink-faint);
          font-family: var(--serif);
          font-size: 10px;
          letter-spacing: 0.3em;
          margin: 6px 0 2px;
          opacity: 0.7;
        }

        .note .prices {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 10px 4px 8px;
        }
        .note .prices .row {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 8px;
          align-items: baseline;
          font-family: var(--cursive);
          color: var(--ink);
        }
        .note .prices .label {
          font-size: clamp(17px, 2vw, 20px);
          font-style: italic;
          color: var(--ink-soft);
        }
        .note .prices .dots {
          background-image: radial-gradient(circle, rgba(34, 27, 18, 0.35) 0.8px, transparent 1.2px);
          background-size: 6px 6px;
          background-position: 0 60%;
          background-repeat: repeat-x;
          height: 10px;
          align-self: center;
        }
        .note .prices .value {
          font-size: clamp(20px, 2.4vw, 26px);
          font-variant-numeric: tabular-nums;
          color: var(--ink);
          letter-spacing: 0.01em;
        }

        .note .footline {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          padding: 6px 2px 0;
          font-family: var(--serif);
          border-top: 1px dashed rgba(34, 27, 18, 0.2);
          margin-top: 6px;
        }
        .note .footline .currency {
          font-size: 10px;
          letter-spacing: 0.2em;
          color: var(--ink-muted);
          font-variation-settings: "opsz" 72, "wght" 600;
        }
        .note .footline .usd {
          font-style: italic;
          font-size: 10.5px;
          color: var(--ink-faint);
          font-variant-numeric: tabular-nums;
          letter-spacing: 0.02em;
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

        @media (max-width: 720px) {
          main {
            gap: 18px;
            padding: 18px 14px 28px;
          }
          .stage {
            display: flex;
            flex-direction: column;
            gap: 20px;
          }
          .right-column {
            flex-direction: row;
            align-items: flex-start;
            justify-content: space-between;
            gap: 14px;
            padding-top: 0;
          }
          .note { flex: 1; max-width: 240px; }
          .note .paper { padding: 12px 14px 10px; }
          .note .prices .label { font-size: 16px; }
          .note .prices .value { font-size: 20px; }
          .polaroid { padding-bottom: 36px; }
          .moment { margin-top: 0; }
        }
      `}</style>
    </>
  );
}
