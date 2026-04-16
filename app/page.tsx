import { getCurrentStory } from "@/lib/stories";
import { formatLocal, formatUsd } from "@/lib/format";

// Refresh the static render once an hour. No countdown, no "next".
// The page just quietly becomes something else.
export const revalidate = 3600;

export default function Page() {
  const s = getCurrentStory();
  const showTranslation =
    s.original_language !== "en" && s.english_text.trim().length > 0;

  const placeParts = [s.city, s.region, s.country]
    .filter((p): p is string => !!p && p.length > 0)
    .filter((p, i, arr) => arr.indexOf(p) === i); // dedupe city==region city-states

  return (
    <main>
      {s.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="photo"
          src={s.photo_url}
          alt=""
          width={1200}
          height={900}
        />
      ) : null}

      <p className="place">{placeParts.join(" · ")}</p>

      <p className="original" lang={s.original_language}>
        {s.original_text}
      </p>

      {showTranslation ? (
        <p className="translation" lang="en">
          {s.english_text}
        </p>
      ) : null}

      <dl className="prices" aria-label="Daily prices">
        <div className="price-row">
          <dt>Milk</dt>
          <dd className="local">
            {formatLocal(s.milk_price_local, s.currency_symbol)}
          </dd>
          <dd className="usd">{formatUsd(s.milk_price_usd)}</dd>
        </div>
        <div className="price-row">
          <dt>Eggs</dt>
          <dd className="local">
            {formatLocal(s.eggs_price_local, s.currency_symbol)}
          </dd>
          <dd className="usd">{formatUsd(s.eggs_price_usd)}</dd>
        </div>
      </dl>

      <footer className="foot">
        <a href="/about">about</a>
      </footer>

      <style>{`
        main {
          width: 100%;
          max-width: 560px;
          padding: 48px 24px 96px;
          display: flex;
          flex-direction: column;
          gap: 28px;
          opacity: 0;
          animation: enter 800ms cubic-bezier(0.22, 0.61, 0.36, 1) 80ms forwards;
        }

        @keyframes enter {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          main { opacity: 1; animation: none; transform: none; }
        }

        .photo {
          width: 100%;
          height: auto;
          display: block;
          aspect-ratio: 4 / 3;
          object-fit: cover;
          background: var(--hairline);
          border-radius: 2px;
        }

        .place {
          margin: 4px 0 0;
          font-family: var(--sans);
          font-size: 12px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-muted);
        }

        .original {
          margin: 0;
          font-size: 22px;
          line-height: 1.45;
          letter-spacing: 0.005em;
          color: var(--ink);
        }

        .translation {
          margin: -8px 0 0;
          font-size: 15px;
          line-height: 1.5;
          color: var(--ink-muted);
        }

        .prices {
          margin: 16px 0 0;
          padding: 16px 0 0;
          border-top: 1px solid var(--hairline);
          display: flex;
          flex-direction: column;
          gap: 6px;
          font-family: var(--sans);
          font-size: 14px;
        }

        .price-row {
          display: grid;
          grid-template-columns: 56px 1fr auto;
          align-items: baseline;
          gap: 16px;
          margin: 0;
        }

        .price-row dt {
          color: var(--ink-muted);
          letter-spacing: 0.05em;
        }

        .price-row dd {
          margin: 0;
        }

        .price-row .local {
          color: var(--ink);
          font-variant-numeric: tabular-nums;
        }

        .price-row .usd {
          color: var(--ink-faint);
          font-variant-numeric: tabular-nums;
          font-size: 13px;
        }

        .foot {
          margin-top: 32px;
          font-family: var(--sans);
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          text-align: center;
        }
        .foot a {
          color: var(--ink-faint);
          text-decoration: none;
        }
        .foot a:hover { color: var(--ink-muted); }

        @media (min-width: 720px) {
          main {
            padding-top: 72px;
          }
          .original {
            font-size: 24px;
          }
        }
      `}</style>
    </main>
  );
}
