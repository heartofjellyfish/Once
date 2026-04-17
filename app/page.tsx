import { getCurrentStory } from "@/lib/stories";
import { formatLocal, formatUsd } from "@/lib/format";
import PencilText from "./_components/PencilText";
import MapPostmark from "./_components/MapPostmark";
import EnvelopeIntro from "./_components/EnvelopeIntro";
import StagedCenter from "./_components/StagedCenter";
import StageBackdrop from "./_components/StageBackdrop";

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

/**
 * Mirror PencilText's delay formula so we know when the handwriting
 * finishes — the staged reveal of image/stamp/place/prices keys off it.
 * Constants must stay in sync with [app/_components/PencilText.tsx].
 */
function computeTitleDurationMs(text: string): number {
  const leadIn = 140;
  const speedMs = 38;
  const periodPauseMs = 260;
  const commaPauseMs = 140;
  const perCharAnimDuration = 520;
  let t = leadIn;
  for (const c of text) {
    t += speedMs;
    if (/[.!?。！？]/.test(c)) t += periodPauseMs;
    else if (/[,、;；:：]/.test(c)) t += commaPauseMs;
  }
  return t + perCharAnimDuration;
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

  // Sequential reveal: title types at center → flies home, then polaroid,
  // stamp, note each make the same entrance. Longer durations + small
  // overlap so each "settle" beat feels 从容, not rushed.
  //
  // The title is three chained PencilText segments inside one StagedCenter:
  // greeting → original → translation. startDelays chain the typing so
  // each waits for the previous to finish + a small breath.
  const greetingText = `From ${s.city}, this ${weekday} \u2014`;
  const GAP_BETWEEN_SEGMENTS = 320;

  const dGreeting = 0;
  const greetingDur = computeTitleDurationMs(greetingText);

  const dOriginal = dGreeting + greetingDur + GAP_BETWEEN_SEGMENTS;
  const originalDur = computeTitleDurationMs(s.original_text);

  const dInnerTranslation = showTranslation
    ? dOriginal + originalDur + GAP_BETWEEN_SEGMENTS
    : 0;
  const translationDur = showTranslation
    ? computeTitleDurationMs(s.english_text)
    : 0;

  const titleTypingEnd = showTranslation
    ? dInnerTranslation + translationDur
    : dOriginal + originalDur;

  const TITLE_FLYOUT = 1400;
  const TITLE_DUR = titleTypingEnd + TITLE_FLYOUT;
  // Typing happens during fadeIn + stare; fly-out begins as last char lands.
  const TITLE_FADEIN = 200 / TITLE_DUR;
  const TITLE_STARE = Math.max(0, titleTypingEnd - 200) / TITLE_DUR;

  const POLAROID_DUR = 2800;
  const STAMP_DUR = 2500;
  const NOTE_DUR = 3000;
  // Pause between stages: the next piece waits until the previous has
  // fully landed + this many ms of quiet before it starts flying in.
  const GAP_BETWEEN_STAGES = 650;

  const dTitle = 0;
  const dPolaroid = dTitle + TITLE_DUR + GAP_BETWEEN_STAGES;
  const dStamp = dPolaroid + POLAROID_DUR + GAP_BETWEEN_STAGES;
  const dNote = dStamp + STAMP_DUR + GAP_BETWEEN_STAGES;
  const dNoteEnd = dNote + NOTE_DUR;

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
        language={s.original_language}
      />

      <StageBackdrop startMs={dTitle} endMs={dNoteEnd} />

      <main>
        <div className="stage">
          <StagedCenter
            delay={dPolaroid}
            duration={POLAROID_DUR}
            scale={1.1}
            stare={0.34}
          >
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
          </StagedCenter>

          <div className="right-column">
            {s.lat != null && s.lng != null ? (
              <StagedCenter
                delay={dStamp}
                duration={STAMP_DUR}
                scale={1.8}
                stare={0.36}
              >
                <div className="stamp-wrap">
                  <MapPostmark
                    lat={s.lat}
                    lng={s.lng}
                    city={s.city}
                    country={s.country}
                    width={108}
                  />
                </div>
              </StagedCenter>
            ) : null}

            <aside
              className="note"
              aria-label="Today's prices and place"
            >
              <StagedCenter
                delay={dNote}
                duration={NOTE_DUR}
                scale={1.18}
                stare={0.38}
              >
                <div
                  className="paper"
                  style={{ "--note-tilt": `${noteTilt}deg` } as React.CSSProperties}
                >
                  <div className="topline">
                    <span className="city">{s.city}</span>
                    <span className="sep" aria-hidden="true">·</span>
                    <span className="clock">{clock}</span>
                  </div>

                  {s.location_summary || s.weather_current ? (
                    <div className="place-info">
                      {s.location_summary ? (
                        <div className="line">{s.location_summary}</div>
                      ) : null}
                      {s.weather_current ? (
                        <div className="line weather">
                          {s.weather_current.toLowerCase()}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="rule" aria-hidden="true">
                    &mdash; · &mdash;
                  </div>
                  <div className="prices">
                    <div className="row">
                      <span className="label">
                        milk <span className="unit">· 1L</span>
                      </span>
                      <span className="dots" aria-hidden="true" />
                      <span className="value">
                        {formatLocal(s.milk_price_local, s.currency_symbol)}
                      </span>
                    </div>
                    <div className="row">
                      <span className="label">
                        eggs <span className="unit">· dozen</span>
                      </span>
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
              </StagedCenter>
            </aside>
          </div>
        </div>

        <article id="moment" className="moment">
          <StagedCenter
            delay={dTitle}
            duration={TITLE_DUR}
            scale={1.08}
            fadeIn={TITLE_FADEIN}
            stare={TITLE_STARE}
          >
            <PencilText
              className="greeting"
              text={greetingText}
              ariaHidden
              startDelay={dGreeting}
            />
            <PencilText
              className="original"
              text={s.original_text}
              lang={s.original_language}
              startDelay={dOriginal}
            />
            {showTranslation ? (
              <PencilText
                className="translation"
                text={s.english_text}
                lang="en"
                startDelay={dInnerTranslation}
              />
            ) : null}
          </StagedCenter>

          {s.source_url ? (
            <p
              className="source reveal"
              style={
                { "--reveal-delay": `${dNoteEnd + 240}ms` } as React.CSSProperties
              }
            >
              <a href={s.source_url} target="_blank" rel="noreferrer">
                source{s.source_name ? ` · ${s.source_name}` : ""}
              </a>
            </p>
          ) : null}
        </article>
      </main>

      <style>{`
        main {
          /* No opacity / transform / filter here: those would make <main>
             a stacking context that traps the staged elements' z-index,
             which is why the backdrop was covering the whole page. */
          width: 100%;
          max-width: 1120px;
          padding: clamp(28px, 4vh, 56px) clamp(16px, 3vw, 40px);
          display: flex;
          flex-direction: column;
          gap: clamp(22px, 3vh, 36px);
          min-height: 100svh;
        }

        /* Staged reveal — each element waits for --reveal-delay (ms) set
           inline, then fades + deblurs in. Delays are computed server-side
           from the title's per-character typing schedule so the sequence
           is: title → polaroid → stamp → place/weather → prices.
           Uses only opacity + filter (no transform) so it doesn't fight
           the polaroid/note rotation. */
        .reveal {
          opacity: 0;
          filter: blur(2px);
          animation: reveal-in 620ms cubic-bezier(0.22, 0.61, 0.36, 1) forwards;
          animation-delay: var(--reveal-delay, 0ms);
          will-change: opacity, filter;
        }
        @keyframes reveal-in {
          0%   { opacity: 0; filter: blur(2px); }
          60%  { opacity: 1; filter: blur(0); }
          100% { opacity: 1; filter: blur(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .reveal {
            opacity: 1 !important;
            animation: none !important;
            filter: none !important;
          }
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
          /* No transform here — it would create a stacking context that
             traps .staged.playing's z-index below the backdrop. The tilt
             lives on .paper (inside .staged) instead. */
          width: 100%;
        }
        .note .paper {
          --note-tilt: 1deg;
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
          transform: rotate(var(--note-tilt, 0deg));
          transform-origin: top center;
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
        .note .prices .unit {
          font-family: var(--sans);
          font-style: normal;
          font-size: 0.62em;
          letter-spacing: 0.08em;
          color: var(--ink-faint);
          text-transform: lowercase;
          margin-left: 2px;
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

        /* ── place-info: location + weather (always visible) ─────── */
        .place-info {
          margin-top: 8px;
          padding-top: 6px;
          border-top: 1px dashed rgba(34, 27, 18, 0.14);
          display: flex;
          flex-direction: column;
          gap: 3px;
          font-family: var(--serif);
          font-style: italic;
          font-size: 12px;
          color: var(--ink-soft);
          text-align: center;
        }
        .place-info .line.weather {
          color: var(--ink-faint);
          font-size: 11px;
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
