import { requireSql, dbAvailable } from "@/lib/db";
import { approveAction, rejectAction } from "./actions";
import { formatLocal, formatUsd } from "@/lib/format";

interface QueueRow {
  id: string;
  status: string;
  created_at: string;
  source_url: string | null;
  source_input: string;
  source_hint_city: string | null;
  ai_model: string | null;
  ai_rationale: string | null;
  ai_passed_filter: boolean | null;
  photo_url: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  timezone: string | null;
  local_hour: number | null;
  original_language: string | null;
  original_text: string | null;
  english_text: string | null;
  currency_code: string | null;
  currency_symbol: string | null;
  milk_price_local: number | null;
  eggs_price_local: number | null;
  milk_price_usd: number | null;
  eggs_price_usd: number | null;
}

export default async function QueuePage({
  searchParams
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const sp = await searchParams;
  const errMsg = sp.err;

  if (!dbAvailable()) {
    return <p className="empty">Database not available — see header notice.</p>;
  }

  const sql = requireSql();
  const rows = (await sql`
    select
      id, status, created_at::text as created_at,
      source_url, source_input, source_hint_city,
      ai_model, ai_rationale, ai_passed_filter,
      photo_url, country, region, city, timezone, local_hour,
      original_language, original_text, english_text,
      currency_code, currency_symbol,
      milk_price_local::float8 as milk_price_local,
      eggs_price_local::float8 as eggs_price_local,
      milk_price_usd::float8   as milk_price_usd,
      eggs_price_usd::float8   as eggs_price_usd
    from moderation_queue
    where status = 'pending'
    order by created_at desc
    limit 50
  `) as unknown as QueueRow[];

  return (
    <>
      {errMsg ? <div className="err">⚠ {errMsg}</div> : null}

      {rows.length === 0 ? (
        <p className="empty">
          Queue is empty. Try <a href="/admin/ingest">ingest</a> or{" "}
          <a href="/admin/compose">compose</a>.
        </p>
      ) : null}

      {rows.map((r) => (
        <article key={r.id} className={`card ${!r.ai_passed_filter ? "flagged" : ""}`}>
          <header>
            <div className="loc">
              {[r.city, r.region, r.country].filter(Boolean).join(" · ") || "—"}
            </div>
            <div className="meta">
              {r.timezone ?? "—"}
              {r.local_hour != null ? ` · local_hour ${r.local_hour}` : ""}
              {r.ai_model ? ` · ${r.ai_model}` : ""}
            </div>
          </header>

          {r.original_text ? (
            <p className="original" lang={r.original_language ?? undefined}>
              {r.original_text}
            </p>
          ) : null}
          {r.english_text ? (
            <p className="translation" lang="en">
              {r.english_text}
            </p>
          ) : null}

          {r.currency_symbol && r.milk_price_local != null ? (
            <dl className="prices">
              <div>
                <dt>Milk</dt>
                <dd>
                  {formatLocal(r.milk_price_local, r.currency_symbol)}
                  <span className="usd"> {formatUsd(r.milk_price_usd ?? 0)}</span>
                </dd>
              </div>
              <div>
                <dt>Eggs</dt>
                <dd>
                  {formatLocal(r.eggs_price_local ?? 0, r.currency_symbol)}
                  <span className="usd"> {formatUsd(r.eggs_price_usd ?? 0)}</span>
                </dd>
              </div>
            </dl>
          ) : null}

          {r.ai_rationale ? (
            <p className="rationale">
              <span className="tag">AI</span> {r.ai_rationale}
            </p>
          ) : null}

          {r.source_url ? (
            <p className="source">
              source:{" "}
              <a href={r.source_url} target="_blank" rel="noreferrer">
                {r.source_url}
              </a>
            </p>
          ) : null}

          <details className="raw">
            <summary>original input</summary>
            <pre>{r.source_input}</pre>
          </details>

          <div className="actions">
            <form action={approveAction}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="photo_url" value={r.photo_url ?? ""} />
              <input type="hidden" name="country" value={r.country ?? ""} />
              <input type="hidden" name="region" value={r.region ?? ""} />
              <input type="hidden" name="city" value={r.city ?? ""} />
              <input type="hidden" name="timezone" value={r.timezone ?? ""} />
              <input type="hidden" name="local_hour" value={String(r.local_hour ?? 12)} />
              <input type="hidden" name="original_language" value={r.original_language ?? ""} />
              <input type="hidden" name="original_text" value={r.original_text ?? ""} />
              <input type="hidden" name="english_text" value={r.english_text ?? ""} />
              <input type="hidden" name="currency_code" value={r.currency_code ?? ""} />
              <input type="hidden" name="currency_symbol" value={r.currency_symbol ?? ""} />
              <input type="hidden" name="milk_price_local" value={String(r.milk_price_local ?? 0)} />
              <input type="hidden" name="eggs_price_local" value={String(r.eggs_price_local ?? 0)} />
              <input type="hidden" name="milk_price_usd" value={String(r.milk_price_usd ?? 0)} />
              <input type="hidden" name="eggs_price_usd" value={String(r.eggs_price_usd ?? 0)} />
              <input type="hidden" name="source_url" value={r.source_url ?? ""} />
              <button type="submit" className="primary">approve &amp; publish</button>
            </form>

            <a className="secondary" href={`/admin/edit/${r.id}`}>edit…</a>

            <form action={rejectAction}>
              <input type="hidden" name="id" value={r.id} />
              <input
                type="text"
                name="reason"
                placeholder="reason (optional)"
                className="reason"
              />
              <button type="submit" className="danger">reject</button>
            </form>
          </div>
        </article>
      ))}

      <style>{`
        .err {
          padding: 10px 12px;
          border: 1px solid var(--hairline);
          border-radius: 4px;
          color: var(--ink-muted);
          font-size: 13px;
          white-space: pre-wrap;
        }
        .empty {
          color: var(--ink-muted);
          font-size: 14px;
        }

        .card {
          border: 1px solid var(--hairline);
          border-radius: 4px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .card.flagged {
          border-color: rgba(200, 120, 0, 0.35);
          background: rgba(200, 120, 0, 0.03);
        }

        .card header {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 12px;
          flex-wrap: wrap;
        }

        .loc {
          font-family: var(--sans);
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-muted);
        }

        .meta {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--ink-faint);
        }

        .original {
          margin: 0;
          font-family: var(--serif);
          font-size: 18px;
          line-height: 1.45;
          color: var(--ink);
        }
        .translation {
          margin: 0;
          font-family: var(--serif);
          font-size: 14px;
          color: var(--ink-muted);
        }

        .prices {
          display: flex;
          gap: 20px;
          margin: 0;
          font-family: var(--sans);
          font-size: 13px;
          color: var(--ink-muted);
        }
        .prices dt { display: inline; letter-spacing: 0.05em; }
        .prices dd { display: inline; margin: 0 0 0 6px; color: var(--ink); }
        .prices .usd { color: var(--ink-faint); margin-left: 4px; }

        .rationale {
          margin: 0;
          font-size: 12px;
          color: var(--ink-muted);
        }
        .tag {
          display: inline-block;
          padding: 1px 6px;
          background: var(--hairline);
          border-radius: 2px;
          margin-right: 6px;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }

        .source {
          margin: 0;
          font-size: 11px;
          color: var(--ink-faint);
          font-family: var(--mono);
        }
        .source a { color: var(--ink-muted); }

        .raw summary {
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ink-faint);
          cursor: pointer;
          user-select: none;
        }
        .raw pre {
          font-family: var(--mono);
          font-size: 12px;
          color: var(--ink-muted);
          white-space: pre-wrap;
          margin: 8px 0 0;
          padding: 10px;
          background: var(--hairline);
          border-radius: 3px;
          max-height: 240px;
          overflow: auto;
        }

        .actions {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }
        .actions form { display: inline-flex; gap: 6px; align-items: center; }

        button, .secondary {
          font-family: var(--sans);
          font-size: 12px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 8px 14px;
          border-radius: 3px;
          border: 1px solid var(--hairline);
          background: transparent;
          color: var(--ink);
          cursor: pointer;
          text-decoration: none;
          display: inline-block;
        }
        button:hover, .secondary:hover { background: var(--hairline); }
        .primary { background: var(--ink); color: var(--bg); border-color: var(--ink); }
        .primary:hover { opacity: 0.9; background: var(--ink); }
        .danger { color: var(--ink-muted); }
        .danger:hover { color: var(--ink); }

        input[type="text"].reason {
          font-family: var(--sans);
          font-size: 12px;
          padding: 7px 10px;
          border: 1px solid var(--hairline);
          background: transparent;
          color: var(--ink);
          border-radius: 3px;
          width: 180px;
        }
      `}</style>
    </>
  );
}
