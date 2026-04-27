"use client";

/**
 * /preview/today-v2 — testimony voice + ink-developing reveal.
 *
 * The bet: switch Once from "cinematic third-person description"
 * to "philosophical testimony anchored in place" (closer to Mary
 * Oliver, Issa, HONY captions than to a literary travel column),
 * AND restore the slow character-by-character reveal that forces
 * the reader to actually read each word — using the existing
 * PencilText component (app/_components/PencilText.tsx).
 *
 * Reading rhythm:
 *  - Page fades in
 *  - Breath line writes itself
 *  - Hero atlas appears
 *  - Take-away line writes slowly, with a small pause after the
 *    period (PencilText's natural punctuation rest)
 *  - As you scroll, each testimony writes itself when it enters
 *    the viewport — the reader cannot skim past unwritten ink.
 *
 * The animation is the medicine. Without it the page becomes a
 * list to scan; with it, each line lands.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import PencilText from "@/app/_components/PencilText";

const TODAY = {
  date: "april 25 · 2026",
  takeAway: "Some days, one good thing is enough.",
  thread: "small beginnings"
};

interface Testimony {
  city: string;
  time: string;
  line: string;
}

const TESTIMONIES: Testimony[] = [
  { city: "Tokyo",         time: "7:14 am",
    line: "There are mornings where no one should speak yet. The teacup helps." },
  { city: "Beijing",       time: "6:14 am",
    line: "Old men play chess at three. They have stopped trying to win." },
  { city: "Mumbai",        time: "3:44 am",
    line: "The fishing trucks arrive before the gulls. Some hungers wake earlier than others." },
  { city: "Istanbul",      time: "1:14 am",
    line: "Some prayers are not for anything in particular. The mist still listens." },
  { city: "Lagos",         time: "11:14 pm",
    line: "A market can open with one stall. That is already a beginning." },
  { city: "London",        time: "10:14 pm",
    line: "Rain in a city is permission to move slowly. The bakery agrees." },
  { city: "São Paulo",     time: "7:14 pm",
    line: "Someone forgot a bag under a jacaranda. That is how you know the evening went well." },
  { city: "San Francisco", time: "3:14 pm",
    line: "The fog forgives everyone. It does not ask why you are out so early." },
  { city: "Sydney",        time: "8:14 am",
    line: "First light is still light, even when no one watches the boat unmoor." }
];

export default function PreviewTodayV2() {
  return (
    <div className="page">
      <header className="masthead">
        <div className="brand">ONCE</div>
        <div className="date">{TODAY.date}</div>
        <div className="nav">
          <Link href="/preview/today" className="vlink">v1</Link>
          <span className="vsep">·</span>
          <span className="vlink active">v2</span>
        </div>
      </header>

      <main className="main">
        {/* Breath line. Writes itself slowly so the reader literally
            takes the breath while the words appear. */}
        <div className="breath">
          <PencilText
            text="take three. then we begin."
            speed={70}
            startDelay={400}
          />
        </div>

        {/* Hero atlas — same image as v1 but smaller and quieter. */}
        <figure className="hero">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/preview/hero-atlas.jpg"
            alt="An atlas page showing nine city scenes connected to a central globe"
          />
        </figure>

        {/* Take-away line — writes after hero settles, slower per
            character so each word feels weighed. */}
        <section className="take">
          <div className="takeline-wrap">
            <PencilText
              text={`“${TODAY.takeAway}”`}
              speed={75}
              periodPauseMs={520}
              startDelay={1700}
              className="takeline"
            />
          </div>
          <p className="threadline">
            today&rsquo;s thread: <em>{TODAY.thread}</em>
          </p>
        </section>

        <hr className="divider" />

        {/* Nine testimonies. Each writes itself when scrolled into
            view — the reader cannot skim past unwritten ink. */}
        <section className="testimonies">
          {TESTIMONIES.map((t) => (
            <TestimonyRow key={t.city} t={t} />
          ))}
        </section>

        <hr className="divider" />

        <p className="permission">
          you don&rsquo;t have to read all of it. one is enough.
        </p>
      </main>

      <footer className="colophon">
        <p className="hand">written by Qi · AI scans the wires; the words are mine</p>
        <p className="small">© Once 2026 · CC BY-NC · preview build · v2 (testimony)</p>
      </footer>

      <style>{`
        :root {
          --paper:    #f0e8d4;
          --paper-2:  #e6dcc4;
          --ink:      #2A241D;
          --ink-2:    #4a3f30;
          --ink-faint:#8b7e63;
          --rust:     #8a3520;
          --sage:     #5a6a48;
          --hairline: rgba(42, 36, 29, 0.16);
        }
        .page {
          background:
            url("/preview/paper-bg.jpg") center / cover fixed,
            var(--paper);
          color: var(--ink);
          min-height: 100vh;
          font-family: "EB Garamond", "Source Serif 4", Georgia, serif;
          animation: page-arrive 1100ms ease-out both;
        }
        @keyframes page-arrive {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .masthead {
          max-width: 720px;
          margin: 0 auto;
          padding: 28px 32px 14px;
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 20px;
          border-bottom: 1px solid var(--hairline);
        }
        .brand {
          font-family: "EB Garamond", Georgia, serif;
          font-size: 32px;
          letter-spacing: 0.32em;
          font-weight: 500;
        }
        .date {
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--ink-2);
        }
        .nav {
          display: flex;
          gap: 6px;
          align-items: baseline;
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        .vlink {
          color: var(--ink-faint);
          text-decoration: none;
        }
        .vlink:hover { color: var(--ink); }
        .vlink.active { color: var(--ink); }
        .vsep { color: var(--hairline); }

        .main {
          max-width: 580px;
          margin: 0 auto;
          padding: 0 32px;
        }

        .breath {
          text-align: center;
          margin: 36px 0 24px;
        }
        .breath p {
          font-style: italic;
          font-size: 13px;
          color: var(--ink-faint);
          margin: 0;
          letter-spacing: 0.04em;
        }

        .hero {
          margin: 0 auto 32px;
          padding: 0;
        }
        .hero img {
          width: 100%;
          display: block;
          border-radius: 2px;
          box-shadow:
            0 1px 0 rgba(42,36,29,0.06),
            0 18px 36px -28px rgba(42,36,29,0.32);
          opacity: 0;
          animation: img-arrive 1600ms ease-out 1100ms both;
        }
        @keyframes img-arrive {
          from { opacity: 0; transform: scale(0.99); }
          to   { opacity: 1; transform: scale(1); }
        }

        .take {
          text-align: center;
          margin: 38px 0 28px;
        }
        .takeline-wrap {
          /* reserve vertical space so the page doesn't jump while the
             take-away ink develops */
          min-height: 90px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        :global(.takeline) {
          font-family: "EB Garamond", Georgia, serif;
          font-style: italic;
          font-size: 28px;
          line-height: 1.35;
          color: var(--ink);
          margin: 0;
          letter-spacing: 0.005em;
        }
        .threadline {
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 10px;
          color: var(--ink-faint);
          letter-spacing: 0.14em;
          text-transform: uppercase;
          margin: 14px 0 0;
          opacity: 0;
          animation: thread-fade 1500ms ease-out 4500ms both;
        }
        @keyframes thread-fade {
          from { opacity: 0; }
          to   { opacity: 0.8; }
        }
        .threadline em {
          color: var(--ink-2);
          font-style: italic;
          font-family: "EB Garamond", Georgia, serif;
          font-size: 12px;
          letter-spacing: 0.04em;
          text-transform: lowercase;
        }

        .divider {
          border: 0;
          border-top: 1px solid var(--hairline);
          margin: 18px 0;
          width: 100%;
        }

        .testimonies {
          margin: 24px 0;
        }

        .permission {
          text-align: center;
          font-style: italic;
          font-size: 14px;
          color: var(--ink-faint);
          margin: 28px 0 12px;
          letter-spacing: 0.02em;
        }

        .colophon {
          max-width: 720px;
          margin: 36px auto 60px;
          padding: 22px 32px 0;
          border-top: 1px solid var(--hairline);
          text-align: center;
        }
        .hand {
          font-family: "EB Garamond", Georgia, serif;
          font-style: italic;
          font-size: 14px;
          color: var(--ink-2);
          margin: 0 0 6px;
        }
        .small {
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.12em;
          color: var(--ink-faint);
          text-transform: uppercase;
          margin: 0;
        }
      `}</style>
    </div>
  );
}

/**
 * One testimony row. Uses IntersectionObserver so PencilText only
 * starts writing when the line enters the viewport — when the user
 * lingers, the words arrive; if they scroll past quickly, each line
 * still gets its turn when revisited.
 *
 * Reserves layout space via an invisible static placeholder so the
 * page doesn't jump as ink develops.
 */
function TestimonyRow({ t }: { t: Testimony }) {
  const [inView, setInView] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { threshold: 0.4, rootMargin: "0px 0px -8% 0px" }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`"${t.line}" — Once · ${t.city}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard not available; ignore */
    }
  }

  return (
    <article ref={ref} className="row">
      <div className="lead">
        <span className="city">{t.city}</span>
        <span className="time">{t.time}</span>
      </div>

      <div className="line-wrap">
        {inView ? (
          <PencilText
            text={t.line}
            speed={48}
            periodPauseMs={420}
            commaPauseMs={220}
            startDelay={120}
            className="line"
          />
        ) : (
          // Layout placeholder — same text, invisible. Same font/size
          // so the row reserves the right height before ink arrives.
          <p className="line placeholder" aria-hidden="true">{t.line}</p>
        )}
      </div>

      <button
        type="button"
        className={`copy ${copied ? "copied" : ""}`}
        onClick={handleCopy}
        title="copy this line"
        aria-label={`Copy testimony from ${t.city}`}
      >
        {copied ? "✓" : "⊕"}
      </button>

      <style>{`
        .row {
          display: grid;
          grid-template-columns: 1fr 28px;
          gap: 8px 12px;
          padding: 18px 0;
          border-bottom: 1px solid var(--hairline);
          align-items: start;
        }
        .row:last-child { border-bottom: none; }
        .lead {
          grid-column: 1 / -1;
          display: flex;
          align-items: baseline;
          gap: 10px;
          margin-bottom: 4px;
        }
        .city {
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--ink-2);
          font-weight: 500;
        }
        .time {
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 9.5px;
          color: var(--ink-faint);
          font-variant-numeric: tabular-nums;
        }
        .line-wrap {
          grid-column: 1;
          grid-row: 2;
        }
        :global(.line) {
          margin: 0;
          font-family: "EB Garamond", Georgia, serif;
          font-size: 17px;
          line-height: 1.55;
          color: var(--ink);
          font-style: italic;
          letter-spacing: 0.005em;
        }
        :global(.line.placeholder) {
          opacity: 0;
        }
        .copy {
          grid-row: 2;
          grid-column: 2;
          background: transparent;
          border: 1px solid var(--hairline);
          color: var(--ink-faint);
          width: 24px;
          height: 24px;
          border-radius: 12px;
          font-size: 13px;
          line-height: 1;
          padding: 0;
          cursor: pointer;
          opacity: 0;
          transition: opacity 200ms, color 200ms, border-color 200ms;
          align-self: center;
          font-family: ui-monospace, monospace;
        }
        .row:hover .copy { opacity: 1; }
        .copy:hover {
          color: var(--ink);
          border-color: var(--ink-2);
        }
        .copy.copied {
          opacity: 1;
          color: var(--sage);
          border-color: var(--sage);
        }
      `}</style>
    </article>
  );
}
