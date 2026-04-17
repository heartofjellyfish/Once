import Link from "next/link";
import { requireSql, dbAvailable } from "@/lib/db";
import {
  approveAction,
  rejectAction,
  pinStoryAction,
  unpinStoryAction,
  restorePendingAction
} from "./actions";
import { formatLocal, formatUsd } from "@/lib/format";
import { currentHour } from "@/lib/stories";

type Tab = "pending" | "approved" | "rejected";

interface QueueRow {
  id: string;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  rejected_reason: string | null;
  published_as_id: string | null;
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
  lat: number | null;
  lng: number | null;
  original_language: string | null;
  original_text: string | null;
  english_text: string | null;
  currency_code: string | null;
  currency_symbol: string | null;
  milk_price_local: number | null;
  eggs_price_local: number | null;
  milk_price_usd: number | null;
  eggs_price_usd: number | null;
  // Joined from stories (approved tab only)
  story_selected_hour: number | null;
  story_published_at: string | null;
}

function parseTab(v: string | undefined): Tab {
  if (v === "approved" || v === "rejected") return v;
  return "pending";
}

export default async function QueuePage({
  searchParams
}: {
  searchParams: Promise<{ err?: string; tab?: string; pinned?: string }>;
}) {
  const sp = await searchParams;
  const errMsg = sp.err;
  const tab = parseTab(sp.tab);
  const pinnedFlash = sp.pinned === "1";

  if (!dbAvailable()) {
    return <p className="empty">Database not available — see header notice.</p>;
  }

  const sql = requireSql();

  // Counts for tab labels.
  const countRows = (await sql`
    select status, count(*)::int as n
    from moderation_queue
    group by status
  `) as unknown as { status: string; n: number }[];
  const counts: Record<Tab, number> = { pending: 0, approved: 0, rejected: 0 };
  for (const r of countRows) {
    if (r.status === "pending" || r.status === "approved" || r.status === "rejected") {
      counts[r.status as Tab] = r.n;
    }
  }

  // Main query, joined with stories for the approved tab so we can show
  // whether a story is currently pinned to the homepage.
  const rows = (await sql`
    select
      q.id, q.status,
      q.created_at::text as created_at,
      q.reviewed_at::text as reviewed_at,
      q.rejected_reason, q.published_as_id,
      q.source_url, q.source_input, q.source_hint_city,
      q.ai_model, q.ai_rationale, q.ai_passed_filter,
      q.photo_url, q.country, q.region, q.city, q.timezone, q.local_hour,
      q.lat::float8 as lat, q.lng::float8 as lng,
      q.original_language, q.original_text, q.english_text,
      q.currency_code, q.currency_symbol,
      q.milk_price_local::float8 as milk_price_local,
      q.eggs_price_local::float8 as eggs_price_local,
      q.milk_price_usd::float8   as milk_price_usd,
      q.eggs_price_usd::float8   as eggs_price_usd,
      s.selected_hour::int8 as story_selected_hour,
      s.published_at::text as story_published_at
    from moderation_queue q
    left join stories s on s.id = q.published_as_id
    where q.status = ${tab}
    order by coalesce(q.reviewed_at, q.created_at) desc
    limit 80
  `) as unknown as QueueRow[];

  const nowHour = currentHour();

  return (
    <>
      {errMsg ? <div className="err">⚠ {errMsg}</div> : null}
      {pinnedFlash ? (
        <div className="ok">✓ Pinned to homepage for this hour.</div>
      ) : null}

      <nav className="tabs">
        {(["pending", "approved", "rejected"] as const).map((t) => (
          <Link
            key={t}
            href={`/admin?tab=${t}`}
            className={`tab ${tab === t ? "active" : ""}`}
          >
            {t} <span className="n">{counts[t]}</span>
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <p className="empty">
          {tab === "pending" ? (
            <>
              Nothing pending. Try <a href="/admin/ingest">ingest</a> or{" "}
              <a href="/admin/compose">compose</a>.
            </>
          ) : tab === "approved" ? (
            <>No approved items yet.</>
          ) : (
            <>No rejected items.</>
          )}
        </p>
      ) : null}

      {rows.map((r) => {
        const isPinnedNow =
          r.story_selected_hour != null && Number(r.story_selected_hour) === nowHour;
        const isPinnedFuture =
          r.story_selected_hour != null && Number(r.story_selected_hour) !== nowHour;

        return (
          <article
            key={r.id}
            className={`card ${!r.ai_passed_filter ? "flagged" : ""} ${tab}`}
          >
            <header>
              <div className="loc">
                {[r.city, r.region, r.country].filter(Boolean).join(" · ") || "—"}
                {tab === "approved" && isPinnedNow ? (
                  <span className="pin-tag">PINNED NOW</span>
                ) : null}
                {tab === "approved" && isPinnedFuture ? (
                  <span className="pin-tag stale">pinned (h{r.story_selected_hour})</span>
                ) : null}
              </div>
              <div className="meta">
                {r.timezone ?? "—"}
                {r.local_hour != null ? ` · local_hour ${r.local_hour}` : ""}
                {r.ai_model ? ` · ${r.ai_model}` : ""}
              </div>
            </header>

            {(() => {
              // Source layout written by the pipeline is "title\n\nsnippet".
              const [rawTitle, ...rest] = (r.source_input ?? "").split("\n\n");
              const title = (rawTitle ?? "").trim();
              const snippet = rest.join("\n\n").trim();
              return title ? (
                <div className="headline">
                  <div className="tag-row">
                    <span className="tag">HEADLINE</span>
                    {r.source_url ? (
                      <a
                        className="headline-link"
                        href={r.source_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        open source ↗
                      </a>
                    ) : null}
                  </div>
                  <h3 className="headline-text">{title}</h3>
                  {snippet ? <p className="headline-snippet">{snippet}</p> : null}
                </div>
              ) : null;
            })()}

            {r.original_text ? (
              <div className="rewrite">
                <span className="tag ok">REWRITE</span>
                <p className="original" lang={r.original_language ?? undefined}>
                  {r.original_text}
                </p>
                {r.english_text ? (
                  <p className="translation" lang="en">
                    {r.english_text}
                  </p>
                ) : null}
              </div>
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

            {tab === "rejected" && r.rejected_reason ? (
              <p className="rationale rejected">
                <span className="tag warn">REJECTED</span> {r.rejected_reason}
              </p>
            ) : null}

            {tab === "approved" && r.published_as_id ? (
              <p className="rationale">
                <span className="tag ok">PUBLISHED</span>{" "}
                <code>{r.published_as_id}</code>
                {r.story_published_at
                  ? ` · ${new Date(r.story_published_at).toLocaleString()}`
                  : ""}
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
              {tab === "pending" ? (
                <>
                  <form action={approveAction}>
                    <ApproveHidden row={r} />
                    <button type="submit" className="primary">
                      approve &amp; publish now
                    </button>
                  </form>

                  <a className="secondary" href={`/admin/edit/${r.id}`}>
                    edit…
                  </a>

                  <form action={rejectAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input
                      type="text"
                      name="reason"
                      placeholder="reason (optional)"
                      className="reason"
                    />
                    <button type="submit" className="danger">
                      reject
                    </button>
                  </form>
                </>
              ) : null}

              {tab === "approved" && r.published_as_id ? (
                <>
                  {isPinnedNow ? (
                    <form action={unpinStoryAction}>
                      <input
                        type="hidden"
                        name="story_id"
                        value={r.published_as_id}
                      />
                      <button type="submit" className="secondary">
                        unpin
                      </button>
                    </form>
                  ) : (
                    <form action={pinStoryAction}>
                      <input
                        type="hidden"
                        name="story_id"
                        value={r.published_as_id}
                      />
                      <button type="submit" className="primary pin">
                        show on homepage now
                      </button>
                    </form>
                  )}
                  <a
                    className="secondary"
                    href="/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    view site ↗
                  </a>
                </>
              ) : null}

              {tab === "rejected" ? (
                <form action={restorePendingAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <button type="submit" className="secondary">
                    restore to pending
                  </button>
                </form>
              ) : null}
            </div>
          </article>
        );
      })}

      <style>{`
        .err, .ok {
          padding: 10px 12px;
          border-radius: 4px;
          font-size: 13px;
          white-space: pre-wrap;
        }
        .err {
          border: 1px solid var(--hairline);
          color: var(--ink-muted);
        }
        .ok {
          background: rgba(109, 140, 72, 0.12);
          color: #3f5e28;
          font-family: var(--mono);
        }
        .empty {
          color: var(--ink-muted);
          font-size: 14px;
        }

        .tabs {
          display: flex;
          gap: 4px;
          border-bottom: 1px solid var(--hairline);
          margin-bottom: 6px;
        }
        .tab {
          font-family: var(--sans);
          font-size: 12px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding: 8px 14px;
          color: var(--ink-faint);
          text-decoration: none;
          border-bottom: 2px solid transparent;
          margin-bottom: -1px;
        }
        .tab:hover { color: var(--ink-muted); }
        .tab.active {
          color: var(--ink);
          border-bottom-color: var(--ink);
        }
        .tab .n {
          font-variant-numeric: tabular-nums;
          color: var(--ink-faint);
          margin-left: 4px;
          font-size: 11px;
        }
        .tab.active .n { color: var(--ink-muted); }

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
        .card.approved {
          background: rgba(109, 140, 72, 0.04);
        }
        .card.rejected {
          opacity: 0.7;
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
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .pin-tag {
          font-family: var(--sans);
          font-size: 9px;
          letter-spacing: 0.16em;
          padding: 2px 6px;
          border-radius: 2px;
          background: var(--ink);
          color: var(--bg);
        }
        .pin-tag.stale {
          background: var(--hairline);
          color: var(--ink-muted);
        }

        .meta {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--ink-faint);
        }

        .headline {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 12px 14px;
          border-left: 3px solid var(--ink);
          background: var(--hairline-soft, rgba(0,0,0,0.02));
          border-radius: 0 3px 3px 0;
        }
        .tag-row {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 10px;
        }
        .headline-link {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--ink-faint);
          text-decoration: none;
          border-bottom: 1px dotted var(--hairline);
        }
        .headline-link:hover {
          color: var(--ink-muted);
          border-bottom-color: var(--ink-muted);
        }
        .headline-text {
          margin: 0;
          font-family: var(--serif);
          font-weight: 500;
          font-size: 20px;
          line-height: 1.3;
          color: var(--ink);
        }
        .headline-snippet {
          margin: 0;
          font-family: var(--serif);
          font-size: 13px;
          line-height: 1.5;
          color: var(--ink-muted);
        }

        .rewrite {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 10px 0 2px;
          border-top: 1px dashed var(--hairline);
        }
        .rewrite .tag {
          align-self: flex-start;
          margin-right: 0;
        }
        .original {
          margin: 0;
          font-family: var(--serif);
          font-size: 16px;
          line-height: 1.45;
          color: var(--ink);
        }
        .translation {
          margin: 0;
          font-family: var(--serif);
          font-size: 13px;
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
        .rationale.rejected { color: var(--accent-dark, #8a3520); }
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
        .tag.warn {
          background: rgba(168, 90, 60, 0.18);
          color: var(--accent-dark, #8a3520);
        }
        .tag.ok {
          background: rgba(109, 140, 72, 0.18);
          color: #3f5e28;
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
        .primary.pin {
          background: var(--accent-dark, #8a3520);
          border-color: var(--accent-dark, #8a3520);
        }
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

/**
 * Hidden fields used by approveAction. Extracted so the pending tab can
 * reuse them across the two approve buttons (plain approve vs. approve+pin).
 */
function ApproveHidden({ row }: { row: QueueRow }) {
  return (
    <>
      <input type="hidden" name="id" value={row.id} />
      <input type="hidden" name="photo_url" value={row.photo_url ?? ""} />
      <input type="hidden" name="country" value={row.country ?? ""} />
      <input type="hidden" name="region" value={row.region ?? ""} />
      <input type="hidden" name="city" value={row.city ?? ""} />
      <input type="hidden" name="timezone" value={row.timezone ?? ""} />
      <input type="hidden" name="local_hour" value={String(row.local_hour ?? 12)} />
      <input type="hidden" name="lat" value={row.lat != null ? String(row.lat) : ""} />
      <input type="hidden" name="lng" value={row.lng != null ? String(row.lng) : ""} />
      <input type="hidden" name="original_language" value={row.original_language ?? ""} />
      <input type="hidden" name="original_text" value={row.original_text ?? ""} />
      <input type="hidden" name="english_text" value={row.english_text ?? ""} />
      <input type="hidden" name="currency_code" value={row.currency_code ?? ""} />
      <input type="hidden" name="currency_symbol" value={row.currency_symbol ?? ""} />
      <input type="hidden" name="milk_price_local" value={String(row.milk_price_local ?? 0)} />
      <input type="hidden" name="eggs_price_local" value={String(row.eggs_price_local ?? 0)} />
      <input type="hidden" name="milk_price_usd" value={String(row.milk_price_usd ?? 0)} />
      <input type="hidden" name="eggs_price_usd" value={String(row.eggs_price_usd ?? 0)} />
      <input type="hidden" name="source_url" value={row.source_url ?? ""} />
    </>
  );
}
