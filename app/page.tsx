import { getCurrentStory } from "@/lib/stories";
import { formatLocal, formatUsd } from "@/lib/format";

// Refresh the static render once an hour. No countdown, no "next".
export const revalidate = 3600;

export default async function Page() {
  const s = await getCurrentStory();
  const showTranslation =
    s.original_language !== "en" && s.english_text.trim().length > 0;

  const placeParts = [s.city, s.region, s.country]
    .filter((p): p is string => !!p && p.length > 0)
    .filter((p, i, arr) => arr.indexOf(p) === i); // dedupe city-states
  const placeLine = placeParts.join(", ");
  const altText = `A photograph from ${placeParts.join(", ")}.`;

  return (
    <>
      <a href="#moment" className="skip-link">
        Skip to the moment
      </a>

      <main>
        <figure className="photo-wrap">
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

        <p className="wordmark" aria-hidden="true">
          <em>Once</em>
        </p>

        <header className="place-block">
          <h1 className="place" lang="en">
            {placeLine}
          </h1>
        </header>

        <article id="moment" className="moment">
          <p className="original" lang={s.original_language}>
            {s.original_text}
          </p>

          {showTranslation ? (
            <p className="translation" lang="en">
              {s.english_text}
            </p>
          ) : null}
        </article>

        <div className="ornament" aria-hidden="true">
          <span>·</span>
          <span>·</span>
          <span>·</span>
        </div>

        <dl className="prices" aria-label="Daily prices">
          <div className="price-row">
            <dt>milk</dt>
            <dd className="local">
              {formatLocal(s.milk_price_local, s.currency_symbol)}
            </dd>
            <dd className="usd">{formatUsd(s.milk_price_usd)}</dd>
          </div>
          <div className="price-row">
            <dt>eggs</dt>
            <dd className="local">
              {formatLocal(s.eggs_price_local, s.currency_symbol)}
            </dd>
            <dd className="usd">{formatUsd(s.eggs_price_usd)}</dd>
          </div>
        </dl>

        <footer className="foot">
          <a href="/about">about</a>
        </footer>
      </main>

      <style>{`
        main {
          width: 100%;
          max-width: 620px;
          padding: 64px 24px 120px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 28px;
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

        /* Photo: cinematic 3:2, extends slightly past the text column
           on wider viewports so it breathes. */
        .photo-wrap {
          margin: 0;
          width: 100%;
          max-width: 760px;
        }
        .photo {
          width: 100%;
          height: auto;
          display: block;
          aspect-ratio: 3 / 2;
          object-fit: cover;
          background: var(--hairline);
          border-radius: 2px;
          box-shadow:
            0 1px 0 rgba(32, 27, 21, 0.04),
            0 18px 48px -24px rgba(32, 27, 21, 0.25);
        }
        .photo-empty {
          background:
            repeating-linear-gradient(
              45deg,
              var(--hairline-soft) 0px,
              var(--hairline-soft) 12px,
              transparent 12px,
              transparent 24px
            );
        }

        /* Wordmark — the only piece of "branding". Appears as a small
           italic signature between photo and place. */
        .wordmark {
          margin: 6px 0 -4px;
          font-family: var(--serif);
          font-variation-settings: "opsz" 144, "SOFT" 100, "wght" 400;
          font-size: 15px;
          font-style: italic;
          color: var(--ink-faint);
          letter-spacing: 0.04em;
        }
        .wordmark em {
          font-style: italic;
          padding: 0 14px;
          position: relative;
        }
        .wordmark em::before,
        .wordmark em::after {
          content: "";
          position: absolute;
          top: 52%;
          width: 18px;
          height: 1px;
          background: var(--ink-faint);
          opacity: 0.5;
        }
        .wordmark em::before { right: 100%; }
        .wordmark em::after  { left: 100%; }

        .place-block {
          text-align: center;
        }
        .place {
          margin: 0;
          font-family: var(--serif);
          font-style: italic;
          font-variation-settings: "opsz" 72, "SOFT" 60, "wght" 400;
          font-size: clamp(19px, 2.2vw, 22px);
          color: var(--ink);
          letter-spacing: 0.005em;
          text-wrap: balance;
        }

        .moment {
          width: 100%;
          max-width: 520px;
        }
        .original {
          margin: 0;
          font-family: var(--serif);
          font-variation-settings: "opsz" 32, "SOFT" 50, "wght" 400;
          font-size: clamp(20px, 2.3vw, 23px);
          line-height: 1.5;
          letter-spacing: 0.003em;
          color: var(--ink);
          text-wrap: pretty;
        }
        .translation {
          margin: 18px 0 0;
          font-family: var(--serif);
          font-style: italic;
          font-variation-settings: "opsz" 16, "SOFT" 100, "wght" 400;
          font-size: 16px;
          line-height: 1.55;
          color: var(--ink-muted);
          text-wrap: pretty;
        }

        /* Three-dot ornament — classic editorial section break. */
        .ornament {
          display: flex;
          gap: 18px;
          color: var(--ink-faint);
          font-size: 14px;
          letter-spacing: 0;
          margin: 4px 0;
        }
        .ornament span {
          line-height: 1;
        }

        /* Prices as a quiet detail. Tabular numerics so the columns
           don't shift when the two currencies align. */
        .prices {
          margin: 0;
          width: 100%;
          max-width: 360px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-family: var(--serif);
          font-variation-settings: "opsz" 16, "SOFT" 80, "wght" 400;
          font-size: 14px;
          color: var(--ink-muted);
        }
        .price-row {
          display: grid;
          grid-template-columns: 1fr auto auto;
          align-items: baseline;
          gap: 16px;
        }
        .price-row dt {
          font-style: italic;
          color: var(--ink-faint);
          letter-spacing: 0.02em;
        }
        .price-row dd {
          margin: 0;
        }
        .price-row .local {
          color: var(--ink);
          font-variant-numeric: tabular-nums oldstyle-nums;
        }
        .price-row .usd {
          color: var(--ink-faint);
          font-variant-numeric: tabular-nums oldstyle-nums;
          font-size: 13px;
        }

        .foot {
          margin-top: 28px;
          font-family: var(--serif);
          font-style: italic;
          font-size: 12px;
          color: var(--ink-faint);
          letter-spacing: 0.02em;
        }
        .foot a {
          text-decoration: none;
        }
        .foot a:hover {
          color: var(--ink-muted);
        }

        @media (min-width: 720px) {
          main {
            padding-top: 80px;
            gap: 32px;
          }
        }
      `}</style>
    </>
  );
}
