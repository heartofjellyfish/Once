import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "about"
};

export default function AboutPage() {
  return (
    <main>
      <p className="greeting" aria-hidden="true">
        a note &mdash;
      </p>

      <h1>one small moment, somewhere else</h1>

      <p>
        Once shows one small thing happening somewhere in the world — a bakery
        that ran out of bread, a bus that was a few minutes late, a market
        that closed early because the owner had to pick up her granddaughter
        from school.
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
          max-width: 580px;
          padding: clamp(48px, 8vh, 96px) clamp(20px, 5vw, 32px) 80px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 22px;
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

        .greeting {
          margin: 0 0 2px;
          font-family: var(--cursive);
          font-size: 26px;
          color: var(--accent);
          line-height: 1;
        }

        h1 {
          margin: 0 0 8px;
          font-family: var(--serif);
          font-weight: 400;
          font-style: italic;
          font-variation-settings: "opsz" 72, "SOFT" 100, "wght" 400;
          font-size: clamp(26px, 3.6vw, 32px);
          line-height: 1.2;
          letter-spacing: 0.005em;
          color: var(--ink);
          text-wrap: balance;
        }

        p {
          margin: 0;
          font-family: var(--serif);
          font-variation-settings: "opsz" 18, "SOFT" 50, "wght" 400;
          font-size: 17px;
          line-height: 1.65;
          color: var(--ink);
          text-wrap: pretty;
        }

        em {
          font-style: italic;
          color: var(--ink-muted);
        }

        .back {
          margin-top: 24px;
          font-style: italic;
          font-size: 13px;
          color: var(--ink-faint);
        }
        .back a {
          text-decoration: none;
        }
        .back a:hover {
          color: var(--accent);
        }
      `}</style>
    </main>
  );
}
