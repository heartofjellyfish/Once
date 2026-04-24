import Link from "next/link";
import { ReviewActionForm } from "./_components/ReviewActions";
import RerollButton from "./_components/RerollButton";
import PhotoRow from "./_components/PhotoRow";
import { CardJourney } from "./_components/CardJourney";
import { requireSql, dbAvailable } from "@/lib/db";
import { ensurePhotoColumns } from "@/lib/ogImage";

/**
 * Map the 2-axis C1/C2 fit integer (0/1/2) to its Chinese label.
 * Stored as integer in score_specificity (C1) + score_resonance (C2)
 * for back-compat with the older 3-axis schema's columns.
 */
function fitLabel(n: number): string {
  if (n >= 2) return "非常符合";
  if (n === 1) return "基本符合";
  return "不符合";
}
import {
  approveAction,
  rejectAction,
  restorePendingAction,
  markGoodAction,
  rerollPhotoAction
} from "./actions";

import { formatLocal, formatUsd } from "@/lib/format";
import { currentHour } from "@/lib/stories";

type Tab = "pending" | "approved" | "rejected";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function journeyLabel(s: any): string {
  switch (s?.step) {
    case "og_skipped":
      return `og: skipped — ${s.reason}`;
    case "og_scraped":
      return s.url ? `og: scraped ${truncate(s.url, 60)}` : "og: scrape returned nothing";
    case "og_judged":
      return `og vision: ${s.score}/10 "${s.reason}" → ${s.kept ? "kept" : "rejected"}`;
    case "og_judge_unavailable":
      return "og vision: unavailable (kept by default)";
    case "library_query":
      return `${s.library}: "${s.query}" → ${s.hit ? "hit" : "no hit"}`;
    case "relevance_judged":
      return `${s.library} vision: ${s.score}/10 "${s.reason}" → ${s.kept ? "kept ✓" : "rejected"}`;
    case "fallback":
      return `fallback → ${s.to} (${s.reason})`;
    default:
      return JSON.stringify(s);
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

interface PhotoMeta {
  photo_source: string | null;
  photo_query: string | null;
  photo_attribution_url: string | null;
  photo_attribution_name: string | null;
  photo_vision_score: number | null;
  photo_vision_reason: string | null;
  photo_cost_usd: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  photo_journey: any[] | null;
}

interface QueueRow extends Partial<PhotoMeta> {
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
  score_specificity: number | null;
  score_resonance: number | null;
  score_register: number | null;
  rank: number | null;
  city_id: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  journey: any | null;
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
  searchParams: Promise<{
    err?: string;
    tab?: string;
    pinned?: string;
    patched?: string;
    rejected?: string;
    marked?: string;
    approved?: string;
  }>;
}) {
  const sp = await searchParams;
  const errMsg = sp.err;
  const tab = parseTab(sp.tab);
  const pinnedFlash = sp.pinned === "1";
  const patchedFlash = sp.patched === "1";
  const rejectedFlash = sp.rejected === "1";
  const markedGoodFlash = sp.marked === "good";
  const approvedFlash = sp.approved === "1";

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

  // Photo metadata columns are added lazily on first resolve; ensure
  // them here so SELECTing them on a fresh DB doesn't error.
  await ensurePhotoColumns();

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
      q.score_specificity, q.score_resonance, q.score_register,
      q.rank, q.city_id,
      q.photo_source, q.photo_query,
      q.photo_attribution_url, q.photo_attribution_name,
      q.photo_vision_score, q.photo_vision_reason,
      q.photo_cost_usd::float8 as photo_cost_usd,
      q.photo_journey,
      q.journey,
      s.selected_hour::int8 as story_selected_hour,
      s.published_at::text as story_published_at
    from moderation_queue q
    left join stories s on s.id = q.published_as_id
    where q.status = ${tab}
    order by
      case when q.status = 'pending' then q.city_id end nulls last,
      case when q.status = 'pending' then q.rank end asc nulls last,
      coalesce(q.reviewed_at, q.created_at) desc
    limit 200
  `) as unknown as QueueRow[];

  const nowHour = currentHour();

  return (
    <>
      {errMsg ? <div className="err">⚠ {errMsg}</div> : null}
      {approvedFlash ? (
        <div className="ok">
          ✓ Approved. Story is in the library — drag it onto a slot in{" "}
          <Link href="/admin/schedule">schedule</Link> to publish it.
        </div>
      ) : null}
      {pinnedFlash ? (
        <div className="ok">✓ Scheduled.</div>
      ) : null}
      {patchedFlash ? (
        <div className="ok">✓ Story updated.</div>
      ) : null}
      {markedGoodFlash ? (
        <div className="ok">✓ Marked as good (training signal recorded).</div>
      ) : null}
      {rejectedFlash ? (
        <div className="no">✗ Rejected (reason recorded).</div>
      ) : null}

      <nav className="tabs">
        {(["pending", "approved", "rejected"] as const).map((t) => (
          <Link
            key={t}
            href={`/admin?tab=${t}`}
            className={`tab tab-${t} ${tab === t ? "active" : ""}`}
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
                {tab === "pending" && r.rank != null ? (
                  <span className="rank">#{r.rank}</span>
                ) : null}
                {[r.city, r.region, r.country].filter(Boolean).join(" · ") || "—"}
                {tab === "approved" && isPinnedNow ? (
                  <span className="pin-tag">PINNED NOW</span>
                ) : null}
                {tab === "approved" && isPinnedFuture ? (
                  <span className="pin-tag stale">pinned (h{r.story_selected_hour})</span>
                ) : null}
              </div>
              <div className="meta">
                {r.score_specificity != null && r.score_resonance != null ? (
                  <span className="scores" title="C1 有看头 · C2 人类共同困境">
                    <span className={`fit fit-${r.score_specificity}`}>
                      看头 {fitLabel(r.score_specificity)}
                    </span>
                    <span className={`fit fit-${r.score_resonance}`}>
                      困境 {fitLabel(r.score_resonance)}
                    </span>
                  </span>
                ) : null}
                {r.timezone ? ` · ${r.timezone}` : ""}
                {r.local_hour != null ? ` · ${String(r.local_hour).padStart(2, "0")}:00` : ""}
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

            <CardJourney journey={r.journey} />

            {tab === "pending" ? (
              // Plain form — reroll updates the card, doesn't remove it.
              // The form wraps PhotoRow so its useFormStatus sees pending.
              <form action={rerollPhotoAction}>
                <input type="hidden" name="id" value={r.id} />
                <PhotoRow>
                  {r.photo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.photo_url} alt="hero candidate" className="photo-thumb" />
                  ) : (
                    <div className="photo-thumb photo-thumb-empty">no photo yet</div>
                  )}
                  <div className="photo-meta">
                    {r.photo_source ? (
                      <div className="photo-meta-line">
                        <span className={`photo-src src-${r.photo_source}`}>
                          {r.photo_source}
                        </span>
                        {r.photo_vision_score != null ? (
                          <span className="photo-score" title={r.photo_vision_reason ?? ""}>
                            vision {r.photo_vision_score}/10
                          </span>
                        ) : null}
                        {r.photo_cost_usd != null && r.photo_cost_usd > 0 ? (
                          <span className="photo-cost">
                            ~${r.photo_cost_usd.toFixed(4)}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {r.photo_query ? (
                      <div className="photo-meta-line mono">
                        query: <span className="photo-q">{r.photo_query}</span>
                      </div>
                    ) : null}
                    {r.photo_attribution_url ? (
                      <div className="photo-meta-line">
                        <a
                          href={r.photo_attribution_url}
                          target="_blank"
                          rel="noreferrer"
                          className="photo-attr"
                        >
                          {r.photo_attribution_name || "source"} ↗
                        </a>
                      </div>
                    ) : null}
                    {Array.isArray(r.photo_journey) && r.photo_journey.length > 0 ? (
                      <details className="photo-journey">
                        <summary>journey ({r.photo_journey.length} steps)</summary>
                        <ol>
                          {r.photo_journey.map((s, i) => (
                            <li key={i}>{journeyLabel(s)}</li>
                          ))}
                        </ol>
                      </details>
                    ) : null}
                    <RerollButton hasPhoto={!!r.photo_url} />
                  </div>
                </PhotoRow>
              </form>
            ) : null}

            {tab === "pending" ? (
              <div className="actions">
                <ReviewActionForm action={markGoodAction} className="good-form">
                  <input type="hidden" name="id" value={r.id} />
                  <input
                    type="text"
                    name="note"
                    placeholder="note (optional)"
                    className="reason"
                  />
                  <button type="submit" className="good-btn">
                    ✓ mark good
                  </button>
                </ReviewActionForm>

                <ReviewActionForm action={rejectAction} className="reject-form">
                  <input type="hidden" name="id" value={r.id} />
                  <input
                    type="text"
                    name="reason"
                    placeholder="why not? (optional)"
                    className="reason"
                  />
                  <button type="submit" className="reject-btn">
                    ✗ reject
                  </button>
                </ReviewActionForm>

                <details className="publish-slot">
                  <summary>approve…</summary>
                  <div className="publish-body">
                    <ReviewActionForm action={approveAction}>
                      <ApproveHidden row={r} />
                      <button type="submit" className="publish-btn">
                        approve (adds to library)
                      </button>
                    </ReviewActionForm>
                    <a className="secondary-sm" href={`/admin/edit/${r.id}`}>
                      edit first…
                    </a>
                  </div>
                </details>
              </div>
            ) : null}
            {tab !== "pending" ? (
              <div className="actions">
                {tab === "approved" && r.published_as_id ? (
                  <>
                    <Link className="primary" href="/admin/schedule">
                      schedule →
                    </Link>
                    <a
                      className="secondary"
                      href={`/admin/story/${r.published_as_id}`}
                    >
                      edit story…
                    </a>
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

                {tab === "approved" && !r.published_as_id ? (
                  <span className="meta">training-only (not in library)</span>
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
            ) : null}
          </article>
        );
      })}

      <style>{`
        .err, .ok, .no {
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
        .no {
          background: rgba(168, 90, 60, 0.12);
          color: #8a3520;
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
        .tab-approved { color: #6d8c48; }
        .tab-approved:hover { color: #3f5e28; }
        .tab-approved.active {
          color: #3f5e28;
          border-bottom-color: #3f5e28;
        }
        .tab-approved .n { color: rgba(63, 94, 40, 0.5); }
        .tab-approved.active .n { color: rgba(63, 94, 40, 0.8); }
        .tab-rejected { color: #b87a5c; }
        .tab-rejected:hover { color: #8a3520; }
        .tab-rejected.active {
          color: #8a3520;
          border-bottom-color: #8a3520;
        }
        .tab-rejected .n { color: rgba(138, 53, 32, 0.5); }
        .tab-rejected.active .n { color: rgba(138, 53, 32, 0.8); }

        .card {
          border: 1px solid var(--hairline);
          border-radius: 4px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          transition: opacity 0.2s ease, transform 0.2s ease,
                      max-height 0.2s ease, margin 0.2s ease,
                      padding 0.2s ease;
          max-height: 2000px;
          overflow: hidden;
        }
        .card.exiting {
          opacity: 0;
          transform: scale(0.98);
          max-height: 0;
          margin-top: 0;
          margin-bottom: 0;
          padding-top: 0;
          padding-bottom: 0;
          border-width: 0;
          pointer-events: none;
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
        .rank {
          font-family: var(--mono);
          font-size: 10px;
          padding: 2px 6px;
          border-radius: 2px;
          background: var(--hairline);
          color: var(--ink-muted);
          letter-spacing: 0;
          font-variant-numeric: tabular-nums;
        }
        .scores {
          display: inline-flex;
          gap: 5px;
          align-items: center;
        }
        .fit {
          font-family: var(--sans);
          font-size: 10px;
          letter-spacing: 0;
          padding: 2px 6px;
          border-radius: 2px;
          border: 1px solid var(--hairline);
          color: var(--ink-muted);
          background: transparent;
        }
        .fit-0 {
          color: var(--accent-dark, #8a3520);
          border-color: rgba(168, 90, 60, 0.3);
        }
        .fit-1 {
          color: var(--ink-muted);
          border-color: var(--hairline);
        }
        .fit-2 {
          color: #3f5e28;
          border-color: rgba(109, 140, 72, 0.4);
          background: rgba(109, 140, 72, 0.05);
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
        .photo-row {
          display: flex;
          gap: 14px;
          align-items: flex-start;
          margin: 10px 0;
        }
        .photo-thumb {
          width: 160px;
          height: 107px;
          object-fit: cover;
          border-radius: 3px;
          border: 1px solid var(--hairline, #e4ddd2);
          filter: sepia(0.35) saturate(0.78) contrast(0.97) brightness(0.97);
        }
        .photo-thumb-empty {
          display: flex;
          align-items: center;
          justify-content: center;
          filter: none;
          background: repeating-linear-gradient(
            45deg,
            var(--hairline, #e4ddd2) 0 8px,
            transparent 8px 16px
          );
          color: var(--ink-faint);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .photo-meta {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 12px;
          color: var(--ink-muted);
          flex: 1;
        }
        .photo-meta-line {
          display: flex;
          gap: 10px;
          align-items: baseline;
        }
        .photo-meta-line.mono {
          font-family: var(--mono);
          font-size: 11.5px;
        }
        .photo-src {
          display: inline-block;
          padding: 1px 8px;
          border-radius: 3px;
          font-size: 10.5px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 500;
        }
        .src-og        { background: #e8d4c0; color: #5a3a1a; }
        .src-unsplash  { background: #d4e3d0; color: #2d4a2a; }
        .src-pexels    { background: #c9dce0; color: #1f3a4a; }
        .src-watercolor{ background: #d4dde8; color: #2a3a5a; }
        .src-picsum    { background: #eadad4; color: #6a3a2a; }
        .photo-score {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--ink-faint);
          cursor: help;
        }
        .photo-cost {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--ink-faint);
        }
        .photo-q {
          color: var(--ink);
        }
        .photo-attr {
          color: var(--ink-muted);
          text-decoration: none;
          font-size: 11.5px;
        }
        .photo-attr:hover {
          color: var(--ink);
        }
        .photo-journey {
          margin-top: 2px;
          font-size: 11px;
        }
        .photo-journey summary {
          color: var(--ink-faint);
          cursor: pointer;
          user-select: none;
          letter-spacing: 0.02em;
        }
        .photo-journey summary:hover { color: var(--ink-muted); }
        .photo-journey ol {
          margin: 6px 0 4px;
          padding-left: 20px;
          color: var(--ink-muted);
          font-family: var(--mono);
          font-size: 11px;
          line-height: 1.5;
        }
        .photo-journey li { margin-bottom: 2px; }

        .good-btn, .reject-btn {
          font-family: var(--sans);
          font-size: 12px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 8px 14px;
          border-radius: 3px;
          cursor: pointer;
          border: 1px solid transparent;
          color: #fffaf0;
        }
        .good-btn {
          background: #3f5e28;
          border-color: #3f5e28;
        }
        .good-btn:hover { opacity: 0.88; }
        .reject-btn {
          background: #8a3520;
          border-color: #8a3520;
        }
        .reject-btn:hover { opacity: 0.88; }
        .publish-slot {
          margin-left: auto;
          font-family: var(--sans);
          font-size: 11px;
        }
        .publish-slot summary {
          cursor: pointer;
          color: var(--ink-faint);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          user-select: none;
          padding: 6px 10px;
          border: 1px dashed var(--hairline);
          border-radius: 3px;
          list-style: none;
        }
        .publish-slot[open] summary { color: var(--ink-muted); }
        .publish-body {
          display: flex;
          gap: 8px;
          align-items: center;
          margin-top: 8px;
        }
        .publish-btn {
          font-family: var(--sans);
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 6px 10px;
          border-radius: 3px;
          border: 1px solid var(--hairline);
          background: transparent;
          color: var(--ink-muted);
          cursor: pointer;
        }
        .publish-btn:hover { color: var(--ink); background: var(--hairline); }
        .secondary-sm {
          font-size: 11px;
          color: var(--ink-faint);
          text-decoration: none;
          border-bottom: 1px dotted var(--hairline);
        }

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
