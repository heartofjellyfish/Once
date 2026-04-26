/**
 * Visual preview: what /archive (the Chuck Close mosaic) might look like.
 *
 * Three views — 30 / 100 / 365 day grids — to demonstrate how the
 * "year as one painting" effect emerges as days accumulate. Each tile
 * is a deterministic earth-tone blend (no API calls). When real Once
 * data comes in, each tile becomes the daily cover image thumbnail.
 *
 * The point: convince yourself this is collectible before we build the
 * real thing.
 */
import Link from "next/link";

export const metadata = { title: "Once · archive preview" };

/** Earth-tone palette derived from the byōbu cover. */
const PALETTE = [
  "#d6c4a8", // warm cream
  "#c9b89d", // bone
  "#caa987", // ochre tan
  "#b9a890", // dusty taupe
  "#a8aa9c", // sage gray
  "#c9a07a", // soft terracotta
  "#aa8a8e", // faded rose
  "#9da093", // green stone
  "#b8b59a", // pale moss
  "#a55842", // rust accent (rare)
  "#6e7e5e", // sage accent (rare)
  "#dcc9a8", // very pale gold
  "#a89880", // mid clay
  "#8e8270" // deep stone
];

/** Deterministic pseudo-random tile based on day index. */
function tileColor(dayIdx: number): string {
  // simple hash: rotate through palette weighted by index
  const a = (dayIdx * 16807) % PALETTE.length;
  return PALETTE[a];
}

/**
 * Some tiles are "blended" — tile photo of two colors stacked, suggesting
 * the eventual "8 city mini-mosaic" tile content. Roughly every 4th tile.
 */
function tileGradient(dayIdx: number): string | null {
  if ((dayIdx * 7919) % 4 !== 0) return null;
  const c1 = tileColor(dayIdx);
  const c2 = PALETTE[(dayIdx * 31337) % PALETTE.length];
  return `linear-gradient(${(dayIdx * 13) % 360}deg, ${c1}, ${c2})`;
}

function GridDemo({
  count,
  cols,
  size,
  label
}: {
  count: number;
  cols: number;
  size: number;
  label: string;
}) {
  const tiles = Array.from({ length: count }, (_, i) => i);
  return (
    <div className="demo">
      <h3>
        <span className="num">{count}</span> days
        <span className="sub">{label}</span>
      </h3>
      <div
        className="grid"
        style={{
          gridTemplateColumns: `repeat(${cols}, ${size}px)`,
          gap: size > 12 ? 2 : 1
        }}
      >
        {tiles.map((i) => {
          const grad = tileGradient(i);
          return (
            <div
              key={i}
              className="tile"
              style={{
                width: size,
                height: size,
                background: grad ?? tileColor(i)
              }}
              title={`day ${i + 1}`}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function PreviewArchive() {
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
          A year of <em>Once</em> as one painting. Each tile is a day; each
          day is nine ordinary mornings. The grid is the same for everyone
          — a public artwork the world makes together.
        </p>
        <p className="quiet">
          Hover any tile to see its date · click to open that day · the painting fills as time passes.
        </p>
      </section>

      <GridDemo count={30} cols={6} size={64} label="· first month" />
      <GridDemo count={100} cols={10} size={42} label="· season" />
      <GridDemo count={365} cols={19} size={26} label="· full year" />

      <section className="intro" style={{ marginTop: 48 }}>
        <h2 className="ref">References</h2>
        <ul className="refs">
          <li>
            <strong>Chuck Close</strong> — grids of small abstract cells that
            resolve into a face. Once: grids of days that resolve into a year.
          </li>
          <li>
            <strong>On Kawara</strong> — date paintings, one per day, 1966–
            2014. The accumulation is the work.
          </li>
          <li>
            <strong>Vik Muniz</strong> — meaningful images assembled from
            unrelated material.
          </li>
          <li>
            <strong>Penelope Umbrico</strong> — gridded "<em>Sunsets from
            Flickr</em>." A wall of the same ordinary thing across the world.
          </li>
        </ul>
      </section>

      <footer className="colophon">
        <p className="small">© Once 2026 &nbsp;·&nbsp; preview build</p>
      </footer>

      <style>{`
        :root {
          --paper:    #FAF4E8;
          --paper-2:  #F2EAD8;
          --ink:      #2A241D;
          --ink-2:    #5A4F44;
          --ink-faint:#8B7E6E;
          --rust:     #A55842;
          --hairline: #C9BFAB;
        }

        .page {
          background: var(--paper);
          color: var(--ink);
          min-height: 100vh;
          font-family: "EB Garamond", Georgia, serif;
          background-image:
            radial-gradient(circle at 20% 30%, rgba(165,88,66,0.04) 0, transparent 60%),
            radial-gradient(circle at 80% 70%, rgba(110,126,94,0.04) 0, transparent 60%);
        }

        .masthead {
          max-width: 1100px;
          margin: 0 auto;
          padding: 28px 32px 14px;
          display: flex;
          align-items: baseline;
          justify-content: space-between;
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
          margin: 36px auto 24px;
          padding: 0 32px;
          font-size: 16px;
          line-height: 1.6;
          color: var(--ink-2);
        }
        .intro em { color: var(--ink); font-style: italic; }
        .intro p { margin: 0 0 10px; }
        .intro .quiet {
          color: var(--ink-faint);
          font-size: 13px;
          font-style: italic;
        }

        .demo {
          max-width: 1100px;
          margin: 28px auto 36px;
          padding: 0 32px;
        }
        .demo h3 {
          font-family: "EB Garamond", Georgia, serif;
          font-size: 13px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--ink-2);
          margin: 0 0 14px;
          font-weight: 500;
          display: flex;
          align-items: baseline;
          gap: 10px;
        }
        .demo h3 .num {
          font-family: "JetBrains Mono", ui-monospace, monospace;
          font-weight: 600;
          color: var(--rust);
          letter-spacing: 0;
        }
        .demo h3 .sub {
          color: var(--ink-faint);
          font-size: 11px;
          letter-spacing: 0.08em;
          font-style: italic;
          text-transform: none;
        }

        .grid {
          display: grid;
          padding: 18px;
          background: var(--paper-2);
          border: 1px solid var(--hairline);
          border-radius: 2px;
          width: max-content;
          box-shadow:
            inset 0 0 0 1px rgba(255,255,255,0.4),
            0 1px 0 rgba(42,36,29,0.04);
        }
        .tile {
          border-radius: 1px;
          transition: transform 120ms, box-shadow 120ms;
          cursor: pointer;
        }
        .tile:hover {
          transform: scale(1.4);
          z-index: 2;
          box-shadow: 0 6px 14px rgba(42,36,29,0.2);
        }

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
