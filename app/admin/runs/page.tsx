import { requireSql } from "@/lib/db";
import { runIngestAction } from "../actions";

export const dynamic = "force-dynamic";

interface DecisionRow {
  id: string;
  at: string;
  stage: string;
  verdict: string | null;
  score_specificity: number | null;
  score_resonance: number | null;
  score_register: number | null;
  source_title: string | null;
  source_title_en: string | null;
  source_url: string | null;
  source_snippet: string | null;
  rationale: string | null;
  queue_id: string | null;
  city_id: string | null;
}

interface StatsRow {
  city_id: string;
  name: string;
  country: string;
  last_ingest_at: string | null;
  prefilter_total: number;
  prefilter_passed: number;
  scored: number;
  selected: number;
}

interface CityRow {
  id: string;
  name: string;
  country: string;
  last_ingest_at: string | null;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default async function RunsPage({
  searchParams
}: {
  searchParams: Promise<{ ingest_ok?: string; ingest_err?: string }>;
}) {
  const sp = await searchParams;
  const ingestOk = sp.ingest_ok;
  const ingestErr = sp.ingest_err;

  const sql = requireSql();

  // Active cities for the run dropdown.
  const cities = (await sql`
    select id, name, country, last_ingest_at::text as last_ingest_at
    from cities
    where is_active = true
    order by coalesce(last_ingest_at, 'epoch'::timestamptz) asc
  `) as unknown as CityRow[];

  // 24h funnel per city.
  const stats = (await sql`
    select
      c.id as city_id, c.name, c.country,
      c.last_ingest_at::text as last_ingest_at,
      count(d.*) filter (where d.stage = 'prefilter')::int as prefilter_total,
      count(d.*) filter (where d.stage = 'prefilter' and d.verdict = 'pass')::int as prefilter_passed,
      count(d.*) filter (where d.stage = 'score')::int as scored,
      count(d.*) filter (where d.verdict = 'selected')::int as selected
    from cities c
    left join ai_decisions d
      on d.city_id = c.id and d.at > now() - interval '24 hours'
    where c.is_active = true
    group by c.id, c.name, c.country, c.last_ingest_at
    order by coalesce(c.last_ingest_at, 'epoch'::timestamptz) desc
  `) as unknown as StatsRow[];

  // Recent AI decisions.
  const decisions = (await sql`
    select
      id::text as id,
      at::text as at,
      stage, verdict,
      score_specificity, score_resonance, score_register,
      source_title, source_title_en, source_url, source_snippet, rationale,
      queue_id::text as queue_id,
      city_id
    from ai_decisions
    order by at desc
    limit 80
  `) as unknown as DecisionRow[];

  return (
    <>
      <section className="head">
        <h2>Runs</h2>
        <p className="lede">
          Manually trigger the ingest pipeline for a single city, and watch the
          AI's decisions roll in below. Stats are for the last 24 hours.
        </p>
      </section>

      <section className="run-panel">
        <form action={runIngestAction} className="run-form">
          <label>
            city
            <select name="city" defaultValue="">
              <option value="">(least recently used — default)</option>
              {cities.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.country}
                  {c.last_ingest_at
                    ? ` · last ${timeAgo(c.last_ingest_at)}`
                    : " · never run"}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="primary">
            Run now
          </button>
        </form>

        {ingestOk ? <div className="banner ok">✓ {ingestOk}</div> : null}
        {ingestErr ? <div className="banner err">⚠ {ingestErr}</div> : null}
      </section>

      <section className="stats">
        <h3>24h funnel per city</h3>
        <div className="stats-grid">
          <div className="hd">city</div>
          <div className="hd">considered</div>
          <div className="hd">prefilter✓</div>
          <div className="hd">scored</div>
          <div className="hd">selected</div>
          <div className="hd">last run</div>
          {stats.map((s) => (
            <>
              <div className="cell">
                {s.name}
                <span className="muted"> · {s.country}</span>
              </div>
              <div className="cell num">{s.prefilter_total}</div>
              <div className="cell num">{s.prefilter_passed}</div>
              <div className="cell num">{s.scored}</div>
              <div className="cell num strong">{s.selected}</div>
              <div className="cell muted">
                {s.last_ingest_at ? timeAgo(s.last_ingest_at) : "—"}
              </div>
            </>
          ))}
        </div>
      </section>

      <section className="log">
        <h3>Recent decisions</h3>
        {decisions.length === 0 ? (
          <p className="empty">No pipeline runs yet. Hit "Run now" above.</p>
        ) : (
          <ul className="decisions">
            {decisions.map((d) => (
              <li key={d.id} className={`d d-${d.stage} v-${d.verdict}`}>
                <div className="d-head">
                  <span className="d-time">{timeAgo(d.at)}</span>
                  <span className="d-city">{d.city_id ?? "—"}</span>
                  <span className={`d-stage stage-${d.stage}`}>{d.stage}</span>
                  <span className={`d-verdict verdict-${d.verdict}`}>
                    {d.verdict}
                  </span>
                  {d.score_specificity != null ? (
                    <span className="d-scores">
                      s{d.score_specificity}/r{d.score_resonance}/g
                      {d.score_register}
                    </span>
                  ) : null}
                  {d.queue_id ? (
                    <a className="d-qid" href={`/admin/edit/${d.queue_id}`}>
                      → queue
                    </a>
                  ) : null}
                </div>
                {d.source_title_en || d.source_title ? (
                  <div className="d-title">
                    {d.source_url ? (
                      <a href={d.source_url} target="_blank" rel="noreferrer">
                        {d.source_title_en || d.source_title}
                      </a>
                    ) : (
                      d.source_title_en || d.source_title
                    )}
                    {d.source_title_en &&
                    d.source_title &&
                    d.source_title_en !== d.source_title ? (
                      <span className="d-title-orig"> · {d.source_title}</span>
                    ) : null}
                  </div>
                ) : null}
                {d.rationale ? (
                  <div className="d-rationale">{d.rationale}</div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
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
          max-width: 620px;
          line-height: 1.5;
        }

        .run-panel {
          padding: 14px;
          border: 1px solid var(--hairline);
          border-radius: 4px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .run-form {
          display: flex;
          gap: 10px;
          align-items: flex-end;
          flex-wrap: wrap;
        }
        .run-form label {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ink-muted);
          flex: 1;
          min-width: 280px;
        }
        .run-form select {
          font-family: var(--sans);
          font-size: 13px;
          padding: 8px 10px;
          border: 1px solid var(--hairline);
          background: transparent;
          color: var(--ink);
          border-radius: 3px;
          text-transform: none;
          letter-spacing: normal;
        }
        .run-form .primary {
          font-family: var(--sans);
          font-size: 12px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 10px 18px;
          background: var(--ink);
          color: var(--bg);
          border: 1px solid var(--ink);
          border-radius: 3px;
          cursor: pointer;
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

        .stats h3,
        .log h3 {
          font-family: var(--sans);
          font-size: 12px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-muted);
          margin: 0 0 10px;
        }
        .stats-grid {
          display: grid;
          grid-template-columns: 1.5fr 1fr 1fr 1fr 1fr 1fr;
          row-gap: 4px;
          column-gap: 10px;
          font-family: var(--sans);
          font-size: 13px;
          color: var(--ink);
        }
        .stats-grid .hd {
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-faint);
          padding-bottom: 4px;
          border-bottom: 1px solid var(--hairline);
        }
        .stats-grid .cell {
          padding: 4px 0;
          border-bottom: 1px dashed var(--hairline-soft);
        }
        .stats-grid .cell.num {
          font-variant-numeric: tabular-nums;
          color: var(--ink-muted);
        }
        .stats-grid .cell.num.strong {
          color: var(--ink);
          font-weight: 600;
        }
        .stats-grid .cell .muted,
        .stats-grid .cell.muted {
          color: var(--ink-faint);
          font-size: 11px;
        }

        .decisions {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .d {
          padding: 8px 10px;
          border: 1px solid var(--hairline);
          border-radius: 3px;
          font-family: var(--sans);
          font-size: 13px;
          background: transparent;
        }
        .d.v-selected {
          background: rgba(109, 140, 72, 0.06);
          border-color: rgba(109, 140, 72, 0.3);
        }
        .d.v-pass {
          background: rgba(60, 110, 60, 0.04);
        }
        .d.v-fail {
          background: rgba(128, 128, 128, 0.03);
        }
        .d-head {
          display: flex;
          gap: 10px;
          align-items: baseline;
          flex-wrap: wrap;
          font-size: 11px;
          color: var(--ink-muted);
          letter-spacing: 0.04em;
        }
        .d-time {
          font-variant-numeric: tabular-nums;
          color: var(--ink-faint);
          min-width: 60px;
        }
        .d-city {
          text-transform: uppercase;
          color: var(--ink);
          font-weight: 500;
          min-width: 70px;
        }
        .d-stage {
          padding: 1px 6px;
          border-radius: 2px;
          background: var(--hairline);
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .d-verdict {
          padding: 1px 6px;
          border-radius: 2px;
          font-size: 10px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .d-verdict.verdict-pass {
          background: rgba(60, 140, 60, 0.15);
          color: #2f5f2f;
        }
        .d-verdict.verdict-fail {
          background: rgba(140, 60, 60, 0.1);
          color: #7f3030;
        }
        .d-verdict.verdict-selected {
          background: var(--accent-soft);
          color: white;
        }
        .d-scores {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--ink-muted);
        }
        .d-qid {
          color: var(--accent);
          text-decoration: none;
          font-size: 11px;
        }
        .d-title {
          margin-top: 4px;
          font-family: var(--serif);
          font-size: 14px;
          color: var(--ink);
          line-height: 1.4;
        }
        .d-title a {
          color: inherit;
          text-decoration: none;
          border-bottom: 1px dotted var(--hairline);
        }
        .d-title a:hover {
          border-bottom-color: var(--accent);
          color: var(--accent);
        }
        .d-title-orig {
          color: var(--ink-faint);
          font-style: italic;
          font-size: 12px;
          margin-left: 4px;
        }
        .d-rationale {
          margin-top: 3px;
          font-size: 12px;
          color: var(--ink-muted);
          font-style: italic;
          line-height: 1.4;
        }

        .empty {
          color: var(--ink-faint);
          font-size: 13px;
          font-style: italic;
        }
      `}</style>
    </>
  );
}
