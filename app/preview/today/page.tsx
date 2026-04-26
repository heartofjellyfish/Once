/**
 * Visual preview: what /today (homepage) might look like.
 *
 * Static mockup — no DB, no AI at request time. Hero image is a
 * one-shot atlas-page generation (gpt-image-1.5: globe + 9 city
 * vignettes connected by ink lines, all in earth-tone watercolor on
 * rice paper). Background is a separately-generated rice-paper
 * texture used site-wide. City stories are placeholder Once-voice
 * text.
 */
import Link from "next/link";

export const metadata = { title: "Once · preview" };

interface PreviewCity {
  id: string;
  name: string;
  /** Local time at this city when the story moment happened. */
  localTime: string;
  /** Local hour (0-23) for the sun-position math. */
  localHour: number;
  /** UTC offset in hours (positive east). Used to compute current local time. */
  utcOffset: number;
  text: string;
  milk: string;
  eggs: string;
  hue: string;
}

// Cities sorted east → west by UTC offset, so the byōbu reads like
// the sun crossing the planet (Tokyo +9 first, Sydney +10 wrapping
// — but we keep Sydney last to honor "ends in the Pacific" feel).
const CITIES: PreviewCity[] = [
  { id: "tokyo",         name: "Tokyo",         localTime: "7:14 am",  localHour: 7,  utcOffset: 9,
    text: "茶碗放下的声音比电车更早。窗外没有人。她又坐了一会儿。",
    milk: "¥240",  eggs: "¥288", hue: "#d6c4a8" },
  { id: "beijing",       name: "Beijing",       localTime: "6:14 am",  localHour: 6,  utcOffset: 8,
    text: "胡同口的白雾里，卖豆浆的车还没开门。一只猫已经决定今天不睡了。",
    milk: "¥6.50", eggs: "¥12.80", hue: "#c9b89d" },
  { id: "mumbai",        name: "Mumbai",        localTime: "3:44 am",  localHour: 3,  utcOffset: 5.5,
    text: "Versova fish market — the trucks arrive before the gulls. A boy folds yesterday's newspaper into a hat.",
    milk: "₹66",   eggs: "₹78",  hue: "#caa987" },
  { id: "istanbul",      name: "Istanbul",      localTime: "1:14 am",  localHour: 1,  utcOffset: 3,
    text: "Bosphorus fog. The simit seller pushes his cart up the slope before the call to prayer.",
    milk: "₺36",   eggs: "₺42",  hue: "#b9a890" },
  { id: "lagos",         name: "Lagos",         localTime: "11:14 pm", localHour: 23, utcOffset: 1,
    text: "Mile 12 market opens with one stall. The mangoes were picked before dawn yesterday in Benin.",
    milk: "₦1,800", eggs: "₦2,200", hue: "#c9a07a" },
  { id: "london",        name: "London",        localTime: "10:14 pm", localHour: 22, utcOffset: 0,
    text: "Rain on the cobbles outside a Hackney bakery. The baker turns the dough one last time before bed.",
    milk: "£1.45", eggs: "£2.95", hue: "#a8aa9c" },
  { id: "sao-paulo",     name: "São Paulo",     localTime: "7:14 pm",  localHour: 19, utcOffset: -3,
    text: "Avenida Paulista esvazia. Sob os jacarandás roxos, alguém esqueceu uma sacola da feira.",
    milk: "R$5.20", eggs: "R$11.50", hue: "#aa8a8e" },
  { id: "san-francisco", name: "San Francisco", localTime: "3:14 pm",  localHour: 15, utcOffset: -8,
    text: "Fog through the Sunset, a slow exhale. The crossing guard at 30th Avenue waves to no one.",
    milk: "$4.99", eggs: "$6.49", hue: "#9da093" },
  { id: "sydney",        name: "Sydney",        localTime: "8:14 am",  localHour: 8,  utcOffset: 10,
    text: "First light at Watson's Bay. A sailboat unmoors. The cleaner at the ferry terminal hums something only she knows.",
    milk: "A$2.40", eggs: "A$6.80", hue: "#b8b59a" }
];

export default function PreviewToday() {
  return (
    <div className="page">
      <header className="masthead">
        <div className="brand">ONCE</div>
        <div className="date">april 25 · 2026</div>
        <div className="nav">
          <Link href="/preview/archive">archive →</Link>
        </div>
      </header>

      {/* Hero: atlas page with central globe + 9 city vignettes. */}
      <figure className="hero">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/preview/hero-atlas.jpg"
          alt="An atlas page showing nine city scenes connected to a central globe"
        />
        <figcaption>nine ordinary mornings · the day, sideways</figcaption>
      </figure>

      {/* Byōbu — 9 city panels with sun-angle indicator above. */}
      <section className="byobu-wrap" aria-label="today">
        <SunStrip cities={CITIES} />

        <div className="byobu">
          {CITIES.map((c) => (
            <article key={c.id} className="panel">
              <div
                className="photo"
                style={{
                  background: `linear-gradient(135deg, ${c.hue} 0%, color-mix(in oklch, ${c.hue} 65%, #2A241D) 100%)`
                }}
              >
                <span className="photo-label">{c.id}</span>
              </div>
              <div className="meta">
                <h2>{c.name}</h2>
                <span className="time">{c.localTime}</span>
              </div>
              <p className="text">{c.text}</p>
              <div className="prices">
                <span>milk {c.milk}</span>
                <span className="sep">·</span>
                <span>eggs {c.eggs}</span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <footer className="colophon">
        <p className="hand">edited by Qi Liu &nbsp;·&nbsp; AI scans the wires; the words are mine</p>
        <p className="small">© Once 2026 &nbsp;·&nbsp; CC BY-NC &nbsp;·&nbsp; preview build</p>
      </footer>

      <style>{`
        :root {
          --paper:    #d4b07a;
          --paper-2:  #c39a64;
          --ink:      #2A241D;
          --ink-2:    #4a3f30;
          --ink-faint:#7a6a52;
          --rust:     #8a3520;
          --sage:     #5a6a48;
          --hairline: rgba(42, 36, 29, 0.18);
        }

        .page {
          background:
            url("/preview/paper-bg.jpg") center / cover fixed,
            var(--paper);
          color: var(--ink);
          min-height: 100vh;
          font-family: "EB Garamond", "Source Serif 4", Georgia, serif;
        }

        /* ── masthead ─────────────────────────────── */
        .masthead {
          max-width: 1100px;
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
          font-size: 36px;
          letter-spacing: 0.32em;
          font-weight: 500;
          color: var(--ink);
        }
        .date {
          font-family: "JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace;
          font-size: 12px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--ink-2);
        }
        .nav a {
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--ink-faint);
          text-decoration: none;
          border-bottom: 1px dotted var(--hairline);
        }
        .nav a:hover { color: var(--ink); }

        /* ── hero atlas ───────────────────────────── */
        .hero {
          max-width: 920px;
          margin: 22px auto 8px;
          padding: 0 32px;
        }
        .hero img {
          width: 100%;
          display: block;
          border-radius: 2px;
          box-shadow:
            0 1px 0 rgba(42,36,29,0.06),
            0 22px 40px -28px rgba(42,36,29,0.32);
          /* slow breathing animation */
          animation: breathe 90s ease-in-out infinite alternate;
          transform-origin: center center;
        }
        @keyframes breathe {
          0%   { transform: scale(1); }
          100% { transform: scale(1.03); }
        }
        figcaption {
          margin-top: 10px;
          text-align: center;
          font-style: italic;
          font-size: 13px;
          color: var(--ink-2);
          letter-spacing: 0.04em;
        }

        /* ── byōbu ────────────────────────────────── */
        .byobu-wrap {
          max-width: 1100px;
          margin: 30px auto 28px;
          padding: 0 32px;
        }

        .byobu {
          display: grid;
          grid-template-columns: repeat(9, minmax(0, 1fr));
          gap: 0;
          border-top: 1px solid var(--hairline);
          border-bottom: 1px solid var(--hairline);
          background: rgba(255, 250, 235, 0.18);
        }
        @media (max-width: 1100px) {
          .byobu {
            display: flex;
            overflow-x: auto;
            scroll-snap-type: x mandatory;
            scrollbar-width: thin;
          }
          .panel { flex: 0 0 240px; scroll-snap-align: start; }
        }
        .panel {
          padding: 14px 11px 18px;
          border-right: 1px solid var(--hairline);
          display: flex;
          flex-direction: column;
          gap: 8px;
          position: relative;
          animation: focus-cycle 54s linear infinite;
        }
        .panel:last-child { border-right: none; }

        ${CITIES.map(
          (_, i) => `.panel:nth-child(${i + 1}) { animation-delay: -${i * 6}s; }`
        ).join("\n        ")}

        @keyframes focus-cycle {
          0%, 12%, 100% { background: transparent; }
          5%            { background: rgba(138,53,32,0.07); }
        }

        .photo {
          aspect-ratio: 4 / 3;
          width: 100%;
          border-radius: 2px;
          position: relative;
          overflow: hidden;
          filter: saturate(0.85);
          box-shadow: inset 0 0 0 1px rgba(42,36,29,0.06);
        }
        .photo-label {
          position: absolute;
          bottom: 5px;
          left: 7px;
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 9px;
          letter-spacing: 0.18em;
          color: rgba(250, 244, 232, 0.85);
          text-transform: uppercase;
        }
        .meta {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
        }
        .meta h2 {
          margin: 0;
          font-family: "EB Garamond", Georgia, serif;
          font-size: 15px;
          font-weight: 500;
          letter-spacing: 0.04em;
        }
        .time {
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 9.5px;
          color: var(--ink-2);
          font-variant-numeric: tabular-nums;
        }
        .text {
          margin: 0;
          font-family: "EB Garamond", Georgia, serif;
          font-size: 13px;
          line-height: 1.5;
          color: var(--ink);
          font-style: italic;
        }
        .prices {
          margin-top: auto;
          padding-top: 8px;
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 9.5px;
          color: var(--ink-faint);
          letter-spacing: 0.04em;
          display: flex;
          gap: 6px;
          border-top: 1px dotted var(--hairline);
        }
        .prices .sep { color: var(--hairline); }

        /* ── colophon ─────────────────────────────── */
        .colophon {
          max-width: 1100px;
          margin: 32px auto 60px;
          padding: 24px 32px 0;
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
 * SunStrip — a horizontal SVG band above the byōbu showing where the
 * sun is right now. A small sun glyph slides east→west; each city has
 * a tick mark at its UTC longitude. The city under the sun glyph is
 * the one currently in daylight / focus.
 *
 * Pure SVG, no JS. The CSS animation runs in real time (24h period)
 * but here we hard-code an instant view: sun at the city currently
 * being focused by the byōbu cycle. For mockup, we just show static
 * positions and let the focus-cycle CSS in the byōbu suggest motion.
 */
function SunStrip({ cities }: { cities: PreviewCity[] }) {
  // Map a UTC offset (-12 to +12) to an x-position on the strip [0,1].
  // Right end = +12 east, left end = -12 west. We render east→west by
  // flipping. For Once: +9 (Tokyo) on the left, -8 (SF) near right.
  const xOf = (offset: number): number => {
    // offset in [-12, +14], map to [1, 0] (left=east, right=west)
    return 1 - (offset + 12) / 26;
  };

  return (
    <div className="sun-strip">
      <svg viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true">
        {/* horizontal axis line */}
        <line x1="20" y1="44" x2="980" y2="44" stroke="rgba(42,36,29,0.4)" strokeWidth="0.6" />

        {/* city ticks */}
        {cities.map((c) => {
          const x = 20 + xOf(c.utcOffset) * 960;
          return (
            <g key={c.id}>
              <line x1={x} y1="40" x2={x} y2="48" stroke="rgba(42,36,29,0.6)" strokeWidth="0.8" />
              <text
                x={x}
                y="58"
                textAnchor="middle"
                fontSize="8"
                fill="rgba(42,36,29,0.7)"
                fontFamily="JetBrains Mono, monospace"
                letterSpacing="0.1em"
              >
                {c.name.slice(0, 3).toUpperCase()}
              </text>
            </g>
          );
        })}

        {/* The sun: a soft golden circle that moves east→west, 54s
            loop (matches byōbu focus-cycle). SMIL keeps this dead
            simple — start on Tokyo, end on SF, repeat forever. */}
        <circle
          className="sun"
          cy="22"
          r="9"
          fill="url(#sunGrad)"
          stroke="rgba(165,88,66,0.7)"
          strokeWidth="0.6"
        >
          <animate
            attributeName="cx"
            from="56"
            to="944"
            dur="54s"
            repeatCount="indefinite"
          />
        </circle>

        <defs>
          <radialGradient id="sunGrad" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f3d68a" />
            <stop offset="60%" stopColor="#e8b35e" />
            <stop offset="100%" stopColor="#a55842" stopOpacity="0.5" />
          </radialGradient>
        </defs>
      </svg>

      <style>{`
        .sun-strip {
          margin: 0 auto 6px;
          padding: 0;
        }
        .sun-strip svg {
          width: 100%;
          height: 60px;
          display: block;
        }
        .sun-strip circle.sun {
          filter: drop-shadow(0 0 8px rgba(243,214,138,0.7));
        }
      `}</style>
    </div>
  );
}
