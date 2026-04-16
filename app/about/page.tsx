import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "about"
};

export default function AboutPage() {
  return (
    <main>
      <h1>Once</h1>

      <p>
        Once shows one small moment from somewhere in the world. A bakery that
        ran out of bread. A bus that was a few minutes late. A market that
        closed early because the owner had to pick up her granddaughter from
        school.
      </p>

      <p>
        Every hour it quietly becomes somewhere else. There is no list, no
        feed, no <em>next</em>. Only one item exists at a time — the kind you
        might happen to overhear, walking through a town that is not yours.
      </p>

      <p>
        The two prices, milk and eggs, are not a chart. They are the smallest
        possible thread connecting you to someone else's ordinary day.
      </p>

      <p className="back">
        <a href="/">return</a>
      </p>

      <style>{`
        main {
          width: 100%;
          max-width: 560px;
          padding: 64px 24px 96px;
          display: flex;
          flex-direction: column;
          gap: 20px;
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

        h1 {
          margin: 0 0 12px;
          font-size: 28px;
          font-weight: 400;
          letter-spacing: 0.01em;
        }

        p {
          margin: 0;
          font-size: 17px;
          line-height: 1.6;
          color: var(--ink);
        }

        em { font-style: italic; color: var(--ink-muted); }

        .back {
          margin-top: 24px;
          font-family: var(--sans);
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .back a {
          color: var(--ink-faint);
          text-decoration: none;
        }
        .back a:hover { color: var(--ink-muted); }
      `}</style>
    </main>
  );
}
