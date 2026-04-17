import { requireSql } from "@/lib/db";
import { runIngestAction } from "../actions";
import { updateCityFeeds, toggleCityActive } from "./actions";

export const dynamic = "force-dynamic";

interface CityRow {
  id: string;
  name: string;
  country: string;
  region: string | null;
  timezone: string;
  lat: number;
  lng: number;
  original_language: string | null;
  location_summary: string | null;
  rss_feeds: string[];
  is_active: boolean;
  last_ingest_at: string | null;
  prefilter_total_7d: number;
  prefilter_passed_7d: number;
  selected_7d: number;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function hostOf(u: string): string {
  try {
    return new URL(u).host.replace(/^www\./, "");
  } catch {
    return u;
  }
}

export default async function SourcesPage({
  searchParams
}: {
  searchParams: Promise<{ updated?: string; err?: string; ingest_ok?: string; ingest_err?: string }>;
}) {
  const sp = await searchParams;
  const sql = requireSql();

  // Per-city rows with 7-day funnel stats joined in.
  const rows = (await sql`
    select
      c.id, c.name, c.country, c.region,
      c.timezone,
      c.lat::float8 as lat,
      c.lng::float8 as lng,
      c.original_language,
      c.location_summary,
      c.rss_feeds,
      c.is_active,
      c.last_ingest_at::text as last_ingest_at,
      coalesce(count(d.*) filter (where d.stage = 'prefilter'), 0)::int as prefilter_total_7d,
      coalesce(count(d.*) filter (where d.stage = 'prefilter' and d.verdict = 'pass'), 0)::int as prefilter_passed_7d,
      coalesce(count(d.*) filter (where d.verdict = 'selected'), 0)::int as selected_7d
    from cities c
    left join ai_decisions d
      on d.city_id = c.id and d.at > now() - interval '7 days'
    group by c.id
    order by c.is_active desc, c.name asc
  `) as unknown as CityRow[];

  return (
    <>
      <section className="head">
        <h2>Sources</h2>
        <p className="lede">
          The RSS feeds each city polls on a cron run. Edit the list inline
          (one URL per line; lines starting with <code>#</code> are
          comments). Also flip cities on/off — inactive cities are skipped
          by the pipeline's city picker.
        </p>
      </section>

      {sp.updated ? (
        <div className="banner ok">✓ Saved {sp.updated}</div>
      ) : null}
      {sp.err ? <div className="banner err">⚠ {sp.err}</div> : null}
      {sp.ingest_ok ? <div className="banner ok">✓ {sp.ingest_ok}</div> : null}
      {sp.ingest_err ? (
        <div className="banner err">⚠ {sp.ingest_err}</div>
      ) : null}

      <section className="cities">
        {rows.map((c) => (
          <article key={c.id} id={c.id} className={`city ${c.is_active ? "" : "inactive"}`}>
            <header className="c-head">
              <div className="c-name">
                <span className="nm">{c.name}</span>
                <span className="co"> · {c.country}</span>
                {c.region ? <span className="rg"> · {c.region}</span> : null}
              </div>
              <div className="c-meta">
                <span className="m">lang <b>{c.original_language ?? "—"}</b></span>
                <span className="m">tz <b>{c.timezone}</b></span>
                <span className="m">
                  last <b>{timeAgo(c.last_ingest_at)}</b>
                </span>
                <span className="m">
                  7d funnel{" "}
                  <b>
                    {c.prefilter_total_7d}/{c.prefilter_passed_7d}/
                    {c.selected_7d}
                  </b>
                </span>
              </div>
              <div className="c-actions">
                <form action={runIngestAction} className="inline">
                  <input type="hidden" name="city" value={c.id} />
                  <button type="submit" className="mini">Run now</button>
                </form>
                <form action={toggleCityActive} className="inline">
                  <input type="hidden" name="city_id" value={c.id} />
                  <button type="submit" className="mini">
                    {c.is_active ? "deactivate" : "activate"}
                  </button>
                </form>
              </div>
            </header>

            {c.location_summary ? (
              <p className="c-summary">{c.location_summary}</p>
            ) : null}

            <form action={updateCityFeeds} className="feed-form">
              <input type="hidden" name="city_id" value={c.id} />
              <label>
                RSS feeds (one per line)
                <textarea
                  name="feeds"
                  rows={Math.max(3, c.rss_feeds.length + 1)}
                  defaultValue={c.rss_feeds.join("\n")}
                  spellCheck={false}
                />
              </label>
              <div className="feed-links">
                {c.rss_feeds.map((u) => (
                  <a
                    key={u}
                    href={u}
                    target="_blank"
                    rel="noreferrer"
                    title={u}
                  >
                    ↗ {hostOf(u)}
                  </a>
                ))}
              </div>
              <button type="submit" className="primary save">
                Save feeds
              </button>
            </form>
          </article>
        ))}
      </section>

      <style>{`
        .head h2 {
          font-family: var(--serif);
          font-weight: 400;
          font-size: 22px;
          margin: 0;
        }
        .lede {
          color: var(--ink-muted);
          font-size: 13px;
          margin: 6px 0 0;
          max-width: 640px;
          line-height: 1.5;
        }
        .lede code {
          font-family: var(--mono);
          background: var(--hairline);
          padding: 1px 4px;
          border-radius: 2px;
        }

        .banner {
          padding: 10px 12px;
          border-radius: 3px;
          font-size: 13px;
          font-family: var(--mono);
        }
        .banner.ok {
          background: rgba(109, 140, 72, 0.12);
          color: #3f5e28;
        }
        .banner.err {
          background: rgba(168, 90, 60, 0.12);
          color: var(--accent-dark);
        }

        .cities {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .city {
          border: 1px solid var(--hairline);
          border-radius: 4px;
          padding: 14px 16px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .city.inactive {
          opacity: 0.55;
          background: var(--hairline-soft);
        }

        .c-head {
          display: flex;
          gap: 10px;
          align-items: baseline;
          flex-wrap: wrap;
          justify-content: space-between;
        }
        .c-name {
          font-family: var(--serif);
          font-size: 17px;
          color: var(--ink);
        }
        .c-name .nm { font-weight: 500; }
        .c-name .co { color: var(--ink-muted); }
        .c-name .rg { color: var(--ink-faint); }

        .c-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 14px;
          font-family: var(--sans);
          font-size: 11px;
          color: var(--ink-faint);
          letter-spacing: 0.02em;
        }
        .c-meta b {
          font-weight: 500;
          color: var(--ink-muted);
          font-variant-numeric: tabular-nums;
        }

        .c-actions {
          display: flex;
          gap: 8px;
        }
        .inline { display: inline-block; }
        .mini {
          font-family: var(--sans);
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 5px 10px;
          border-radius: 3px;
          border: 1px solid var(--hairline);
          background: transparent;
          color: var(--ink);
          cursor: pointer;
        }
        .mini:hover { background: var(--hairline); }

        .c-summary {
          margin: 0;
          font-family: var(--serif);
          font-style: italic;
          font-size: 13px;
          color: var(--ink-muted);
        }

        .feed-form {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .feed-form label {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-muted);
        }
        .feed-form textarea {
          font-family: var(--mono);
          font-size: 12px;
          padding: 8px 10px;
          border: 1px solid var(--hairline);
          background: transparent;
          color: var(--ink);
          border-radius: 3px;
          resize: vertical;
          min-height: 60px;
          text-transform: none;
          letter-spacing: normal;
        }
        .feed-form textarea:focus {
          outline: none;
          border-color: var(--ink-muted);
        }

        .feed-links {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          font-family: var(--mono);
          font-size: 11px;
        }
        .feed-links a {
          color: var(--ink-faint);
          text-decoration: none;
          border-bottom: 1px dotted var(--hairline);
        }
        .feed-links a:hover {
          color: var(--accent);
          border-bottom-color: var(--accent-soft);
        }

        .primary.save {
          align-self: flex-start;
          font-family: var(--sans);
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 6px 14px;
          background: var(--ink);
          color: var(--bg);
          border: 1px solid var(--ink);
          border-radius: 3px;
          cursor: pointer;
        }
      `}</style>
    </>
  );
}
