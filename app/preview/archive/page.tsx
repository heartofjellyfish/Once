"use client";

/**
 * Visual preview: archive as a globe made of days.
 *
 * Each day is a tile arranged on a spherical projection — read from
 * the top-left going east-then-down, like reading a globe rolled into
 * lat/lon strips. Selectable density (30 / 100 / 365 / 1000 days)
 * shows how the painting deepens as time accumulates.
 */
import Link from "next/link";
import { useMemo, useState } from "react";

const PALETTE = [
  "#d6c4a8", "#c9b89d", "#caa987", "#b9a890", "#a8aa9c",
  "#c9a07a", "#aa8a8e", "#9da093", "#b8b59a", "#a55842",
  "#6e7e5e", "#dcc9a8", "#a89880", "#8e8270"
];

function tileColor(i: number): string {
  return PALETTE[(i * 16807) % PALETTE.length];
}
function tileGradient(i: number): string | null {
  if ((i * 7919) % 4 !== 0) return null;
  const c2 = PALETTE[(i * 31337) % PALETTE.length];
  return `linear-gradient(${(i * 13) % 360}deg, ${tileColor(i)}, ${c2})`;
}

interface ProjectedTile {
  i: number;
  x: number; // px center
  y: number;
  size: number;
  shade: number; // 0..1, dim toward the limb
}

/**
 * Project N tiles onto a sphere viewed orthographically. We lay tiles
 * on a lat/lon grid where each row is a constant latitude band; the
 * number of tiles per band scales with cos(lat) so they appear roughly
 * equal-sized on the projected sphere. Tiles near the limb get
 * shaded slightly darker to suggest curvature.
 */
function project(N: number, R: number): ProjectedTile[] {
  if (N <= 0) return [];
  // Choose a latitude row count proportional to sqrt(N).
  const rows = Math.max(5, Math.round(Math.sqrt(N) * 1.1));
  // Plan how many tiles fit per row using cos(lat); accumulate until
  // we hit N. We'll trim the final row.
  const plan: { lat: number; cols: number }[] = [];
  let placed = 0;
  for (let r = 0; r < rows && placed < N; r++) {
    // lat from -1.4 to +1.4 (radians-ish, capped to avoid singular pole)
    const lat = ((r + 0.5) / rows - 0.5) * 2 * 1.32;
    const cosL = Math.cos(lat);
    const cols = Math.max(1, Math.round(rows * cosL * 1.6));
    const take = Math.min(cols, N - placed);
    plan.push({ lat, cols: take });
    placed += take;
  }

  // Now project each tile to (x, y) on the sphere face.
  const tiles: ProjectedTile[] = [];
  let i = 0;
  for (const row of plan) {
    for (let c = 0; c < row.cols; c++) {
      // lon from -π to +π distributed evenly
      const lon = ((c + 0.5) / row.cols - 0.5) * 2 * Math.PI;
      // Orthographic projection (sphere centered at origin, radius R, viewed from +Z).
      const x = R * Math.cos(row.lat) * Math.sin(lon);
      const y = R * Math.sin(row.lat); // y down = +; will flip later
      // Shade by distance from center (approximates limb darkening)
      const dist = Math.sqrt(x * x + y * y) / R; // 0..1
      const shade = 1 - dist * 0.55; // 0.45..1
      // Tile size scales with the local "pixel area" — slightly bigger
      // near the equator, smaller near the poles.
      const baseSize = (R * Math.PI) / (row.cols * 1.1);
      tiles.push({ i, x, y, size: baseSize, shade });
      i++;
    }
  }
  return tiles;
}

const DENSITIES = [
  { count: 30,  label: "first month" },
  { count: 100, label: "first season" },
  { count: 365, label: "full year" },
  { count: 1000,label: "three years" }
];

export default function PreviewArchive() {
  const [count, setCount] = useState(365);
  const R = 280; // px
  const tiles = useMemo(() => project(count, R), [count]);

  return (
    <div className="page">
      <header className="masthead">
        <div className="brand">ONCE · archive</div>
        <div className="nav">
          <Link href="/preview/today">← today</Link>
        </div>
      </header>

      <section className="intro">
        <p>
          A globe of <em>days</em>. Each tile is one Once issue — nine
          ordinary mornings stacked into a single color. The grid is the
          same for everyone; you watch it deepen as the year fills.
        </p>
      </section>

      <div className="controls">
        {DENSITIES.map((d) => (
          <button
            key={d.count}
            className={d.count === count ? "active" : ""}
            onClick={() => setCount(d.count)}
          >
            {d.count}
            <span className="lbl">{d.label}</span>
          </button>
        ))}
      </div>

      <div className="globe-stage">
        <svg
          viewBox={`-${R + 24} -${R + 24} ${(R + 24) * 2} ${(R + 24) * 2}`}
          width="640"
          height="640"
          aria-label="archive globe"
        >
          {/* a faint sphere shadow */}
          <defs>
            <radialGradient id="shadow" cx="50%" cy="55%" r="55%">
              <stop offset="0%"  stopColor="#2A241D" stopOpacity="0.05" />
              <stop offset="100%" stopColor="#2A241D" stopOpacity="0.18" />
            </radialGradient>
            <radialGradient id="atmosphere" cx="50%" cy="50%" r="52%">
              <stop offset="92%" stopColor="rgba(42,36,29,0)" />
              <stop offset="100%" stopColor="rgba(42,36,29,0.14)" />
            </radialGradient>
          </defs>

          <circle cx="0" cy="0" r={R + 6} fill="url(#shadow)" />

          {/* tiles */}
          {tiles.map((t) => {
            const grad = tileGradient(t.i);
            const c = grad ?? tileColor(t.i);
            // Use opacity to apply limb shading — multiplied with ink overlay.
            return (
              <g key={t.i}>
                <rect
                  x={t.x - t.size / 2}
                  y={-t.y - t.size / 2}
                  width={t.size}
                  height={t.size}
                  fill={grad ? "transparent" : c}
                  style={grad ? { fill: c } : undefined}
                  opacity={t.shade}
                  rx={1.5}
                />
                {/* dark vignette overlay near limb */}
                <rect
                  x={t.x - t.size / 2}
                  y={-t.y - t.size / 2}
                  width={t.size}
                  height={t.size}
                  fill="#2A241D"
                  opacity={(1 - t.shade) * 0.4}
                  rx={1.5}
                />
              </g>
            );
          })}

          {/* atmosphere ring */}
          <circle cx="0" cy="0" r={R} fill="url(#atmosphere)" />
        </svg>

        <p className="caption">
          {count} days · projected onto a sphere ·
          <span className="quiet"> hover a tile to read its date</span>
        </p>
      </div>

      <section className="intro" style={{ marginTop: 56 }}>
        <h2 className="ref">References</h2>
        <ul className="refs">
          <li><strong>Chuck Close</strong> — grids of small abstract cells that resolve into a face. Once: a globe of days that resolves into a year.</li>
          <li><strong>On Kawara</strong> — date paintings, one per day, 1966–2014. Accumulation is the work.</li>
          <li><strong>Vik Muniz</strong> — meaningful images assembled from unrelated material.</li>
          <li><strong>Penelope Umbrico</strong> — gridded "<em>Sunsets from Flickr</em>." A wall of the same ordinary thing across the world.</li>
        </ul>
      </section>

      <footer className="colophon">
        <p className="small">© Once 2026 · preview build</p>
      </footer>

      <style>{`
        :root {
          --paper:    #d4b07a;
          --paper-2:  #c39a64;
          --ink:      #2A241D;
          --ink-2:    #4a3f30;
          --ink-faint:#7a6a52;
          --rust:     #8a3520;
          --hairline: rgba(42, 36, 29, 0.18);
        }
        .page {
          background:
            url("/preview/paper-bg.jpg") center / cover fixed,
            var(--paper);
          color: var(--ink);
          min-height: 100vh;
          font-family: "EB Garamond", Georgia, serif;
        }
        .masthead {
          max-width: 1100px;
          margin: 0 auto;
          padding: 28px 32px 14px;
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          border-bottom: 1px solid var(--hairline);
        }
        .brand {
          font-size: 28px;
          letter-spacing: 0.28em;
          font-weight: 500;
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
        .intro {
          max-width: 720px;
          margin: 36px auto 18px;
          padding: 0 32px;
          font-size: 16px;
          line-height: 1.6;
          color: var(--ink-2);
        }
        .intro em { color: var(--ink); font-style: italic; }
        .intro p { margin: 0 0 10px; }

        .controls {
          max-width: 720px;
          margin: 0 auto;
          padding: 0 32px;
          display: flex;
          gap: 8px;
          justify-content: center;
        }
        .controls button {
          background: transparent;
          border: 1px solid var(--hairline);
          color: var(--ink-2);
          padding: 8px 14px;
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          cursor: pointer;
          border-radius: 2px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          transition: background 120ms;
        }
        .controls button:hover { background: rgba(42,36,29,0.05); }
        .controls button.active {
          background: var(--ink);
          color: var(--paper);
          border-color: var(--ink);
        }
        .controls .lbl {
          font-family: "EB Garamond", Georgia, serif;
          font-size: 9.5px;
          font-style: italic;
          letter-spacing: 0.04em;
          text-transform: lowercase;
          opacity: 0.8;
        }

        .globe-stage {
          max-width: 1100px;
          margin: 18px auto 8px;
          padding: 0 32px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
        }
        .globe-stage svg {
          width: min(640px, 90vw);
          height: auto;
          filter: drop-shadow(0 18px 36px rgba(42,36,29,0.18));
        }
        .caption {
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-size: 11px;
          color: var(--ink-2);
          letter-spacing: 0.06em;
          margin: 0;
        }
        .caption .quiet { color: var(--ink-faint); margin-left: 6px; }

        .ref {
          font-family: "EB Garamond", Georgia, serif;
          font-size: 16px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--ink-2);
          font-weight: 500;
        }
        .refs {
          padding-left: 20px;
          font-size: 14px;
          line-height: 1.65;
          color: var(--ink-2);
        }
        .refs li { margin-bottom: 8px; }
        .refs strong {
          font-family: "EB Garamond", Georgia, serif;
          font-style: italic;
          color: var(--ink);
          font-weight: 500;
        }

        .colophon {
          max-width: 1100px;
          margin: 48px auto 60px;
          padding: 24px 32px 0;
          border-top: 1px solid var(--hairline);
          text-align: center;
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
