"use client";

import { useState } from "react";

/**
 * Per-card pipeline trace. Rendered at the bottom of each pending /
 * approved / rejected card. Collapsed by default — only the total
 * cost + duration badge is visible. Click to expand each stage.
 *
 * Data comes from moderation_queue.journey (jsonb). Shape is defined
 * in lib/journey.ts (JourneyJSON).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Journey = any;

export function CardJourney({ journey }: { journey: Journey | null }) {
  const [open, setOpen] = useState(false);
  if (!journey) return null;

  const totals = journey.totals ?? { cost_usd: 0, ms: 0, tokens: 0 };
  const costUsd = Number(totals.cost_usd ?? 0);
  const ms = Number(totals.ms ?? 0);

  // Color banding: <$0.01 normal, $0.01-$0.02 yellow, $0.02+ red.
  const costClass =
    costUsd >= 0.05 ? "cost-red" :
    costUsd >= 0.02 ? "cost-yellow" :
    "cost-ok";

  return (
    <div className="journey">
      <button
        type="button"
        className="journey-toggle"
        onClick={() => setOpen(!open)}
      >
        <span className="journey-caret">{open ? "▾" : "▸"}</span>
        <span className="journey-label">how this got here</span>
        <span className={`journey-totals ${costClass}`}>
          {(ms / 1000).toFixed(1)}s · ${costUsd.toFixed(4)}
        </span>
      </button>

      {open && (
        <div className="journey-body">
          {journey.source && (
            <Row label="Source">
              <code>{journey.source.source_host ?? "?"}</code>
              {" · "}
              <span className="dim">{journey.source.kind}</span>
              {journey.source.feed_url && (
                <>
                  {" · "}
                  <a
                    href={journey.source.feed_url}
                    target="_blank"
                    rel="noreferrer"
                    className="dim-link"
                  >
                    feed ↗
                  </a>
                </>
              )}
              {journey.source.source_url && (
                <>
                  {" · "}
                  <a
                    href={journey.source.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="dim-link"
                  >
                    article ↗
                  </a>
                </>
              )}
            </Row>
          )}

          {journey.prefilter && (
            <Row label="Prefilter">
              <code>{journey.prefilter.model}</code>
              {" · "}
              <span className={journey.prefilter.pass ? "ok" : "fail"}>
                {journey.prefilter.pass ? "PASS" : "FAIL"}
              </span>
              {" · "}
              <span className="dim">
                &quot;{truncate(journey.prefilter.why, 80)}&quot;
              </span>
              <div className="row-sub">
                <Tokens
                  p={journey.prefilter.prompt_tokens}
                  c={journey.prefilter.cached_tokens}
                  o={journey.prefilter.completion_tokens}
                />
                {" · "}
                <Ms ms={journey.prefilter.ms} />
                {" · "}
                <Cost v={journey.prefilter.cost_usd} />
              </div>
            </Row>
          )}

          {journey.body && (
            <Row label="Body">
              <code>{journey.body.method}</code>
              {" · "}
              <span className="dim">{journey.body.chars} chars</span>
              {journey.body.paywalled && (
                <>
                  {" · "}
                  <span className="fail">paywalled</span>
                </>
              )}
              {journey.body.error && (
                <>
                  {" · "}
                  <span className="fail">
                    error: {truncate(journey.body.error, 60)}
                  </span>
                </>
              )}
              <div className="row-sub">
                <Ms ms={journey.body.ms} />
              </div>
            </Row>
          )}

          {journey.score && (
            <Row label="Score">
              <code>{journey.score.model}</code>
              {" · "}
              <FitBadge label="看头" fit={journey.score.c1} />
              {" "}
              <FitBadge label="困境" fit={journey.score.c2} />
              {journey.score.rationale && (
                <div className="row-sub">
                  <span className="dim">
                    &quot;{truncate(journey.score.rationale, 160)}&quot;
                  </span>
                </div>
              )}
              <div className="row-sub">
                <Tokens
                  p={journey.score.prompt_tokens}
                  c={journey.score.cached_tokens}
                  o={journey.score.completion_tokens}
                />
                {" · "}
                <Ms ms={journey.score.ms} />
                {" · "}
                <Cost v={journey.score.cost_usd} />
              </div>
            </Row>
          )}

          {journey.rewrite && (
            <Row label="Rewrite">
              <code>{journey.rewrite.model}</code>
              {" · "}
              <span className="dim">{journey.rewrite.length} chars</span>
              <div className="row-sub">
                <Tokens
                  p={journey.rewrite.prompt_tokens}
                  c={journey.rewrite.cached_tokens}
                  o={journey.rewrite.completion_tokens}
                />
                {" · "}
                <Ms ms={journey.rewrite.ms} />
                {" · "}
                <Cost v={journey.rewrite.cost_usd} />
              </div>
            </Row>
          )}

          {journey.photo && (
            <Row label="Photo">
              <code>{journey.photo.source ?? "?"}</code>
              {journey.photo.model && (
                <>
                  {" · "}
                  <span className="dim">vision: {journey.photo.model}</span>
                </>
              )}
              {journey.photo.query && (
                <>
                  {" · "}
                  <span className="dim">
                    q: &quot;{truncate(journey.photo.query, 40)}&quot;
                  </span>
                </>
              )}
              {journey.photo.vision_score != null && (
                <>
                  {" · "}
                  <span className="dim">
                    vision {journey.photo.vision_score}/10
                  </span>
                </>
              )}
              <div className="row-sub">
                {journey.photo.ms > 0 && <><Ms ms={journey.photo.ms} />{" · "}</>}
                <Cost v={journey.photo.cost_usd} />
              </div>
              {Array.isArray(journey.photo.steps) && journey.photo.steps.length > 0 && (
                <div className="photo-steps">
                  {journey.photo.steps.map(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (s: any, i: number) => (
                      <div key={i} className="photo-step">
                        · {photoStepLabel(s)}
                      </div>
                    )
                  )}
                </div>
              )}
            </Row>
          )}

          <div className="totals">
            <span>TOTAL</span>
            <span className="dim">
              {(ms / 1000).toFixed(1)}s · {totals.tokens} tokens
            </span>
            <span className={costClass}>${costUsd.toFixed(4)}</span>
          </div>
        </div>
      )}

      <style>{`
        .journey {
          margin-top: 8px;
          border-top: 1px dashed var(--hairline);
          padding-top: 8px;
          font-family: var(--mono, ui-monospace, monospace);
          font-size: 11px;
        }
        .journey-toggle {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--ink-muted);
          padding: 2px 0;
          font-family: inherit;
          font-size: inherit;
        }
        .journey-toggle:hover { color: var(--ink); }
        .journey-caret { width: 12px; text-align: center; }
        .journey-label { letter-spacing: 0.05em; }
        .journey-totals { margin-left: 4px; }
        .cost-ok { color: var(--ink-muted); }
        .cost-yellow { color: #a67a00; }
        .cost-red { color: #8a3520; font-weight: 500; }

        .journey-body {
          margin-top: 8px;
          padding: 10px 12px;
          background: rgba(0,0,0,0.02);
          border-radius: 3px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .journey-body code {
          font-family: var(--mono, ui-monospace, monospace);
          font-size: 10.5px;
          color: var(--ink);
        }
        .row {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .row-head {
          display: flex;
          gap: 8px;
          align-items: baseline;
        }
        .row-label {
          width: 80px;
          color: var(--ink-faint);
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-size: 10px;
        }
        .row-main { flex: 1; }
        .row-sub {
          margin-left: 88px;
          color: var(--ink-faint);
          font-size: 10.5px;
        }
        .dim { color: var(--ink-muted); }
        .dim-link {
          color: var(--ink-muted);
          text-decoration: none;
          border-bottom: 1px dotted var(--hairline);
        }
        .ok { color: #3f5e28; }
        .fail { color: #8a3520; }

        .fit-badge {
          display: inline-block;
          padding: 1px 5px;
          font-size: 9.5px;
          letter-spacing: 0;
          border-radius: 2px;
          border: 1px solid var(--hairline);
          margin-right: 2px;
        }
        .fit-strong_fit {
          color: #3f5e28;
          border-color: rgba(109,140,72,0.4);
          background: rgba(109,140,72,0.05);
        }
        .fit-basic_fit { color: var(--ink-muted); }
        .fit-no_fit { color: #8a3520; border-color: rgba(168,90,60,0.3); }

        .photo-steps {
          margin-left: 88px;
          margin-top: 4px;
          color: var(--ink-faint);
          font-size: 10px;
        }
        .photo-step { padding: 1px 0; }

        .totals {
          margin-top: 6px;
          padding-top: 6px;
          border-top: 1px dashed var(--hairline);
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          font-size: 10.5px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
      `}</style>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="row">
      <div className="row-head">
        <span className="row-label">{label}</span>
        <span className="row-main">{children}</span>
      </div>
    </div>
  );
}

function Tokens({ p, c, o }: { p: number; c: number; o: number }) {
  return (
    <span>
      {p}↓ / {c}☁ / {o}↑
    </span>
  );
}

function Ms({ ms }: { ms: number }) {
  return <span>{ms}ms</span>;
}

function Cost({ v }: { v: number }) {
  return <span>${v.toFixed(5)}</span>;
}

function FitBadge({ label, fit }: { label: string; fit: string }) {
  const ch =
    fit === "strong_fit" ? "非常" :
    fit === "basic_fit" ? "基本" :
    "不符";
  return (
    <span className={`fit-badge fit-${fit}`}>
      {label} {ch}
    </span>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function photoStepLabel(s: any): string {
  switch (s?.step) {
    case "og_skipped":
      return `og: skipped (${s.reason})`;
    case "og_scraped":
      return s.url ? `og: scraped` : "og: no image";
    case "og_judged":
      return `og vision ${s.score}/10 → ${s.kept ? "kept" : "rejected"}`;
    case "og_judge_unavailable":
      return "og vision: unavailable (kept)";
    case "library_query":
      return `${s.library}: "${truncate(s.query, 40)}" → ${s.hit ? "hit" : "miss"}`;
    case "relevance_judged":
      return `${s.library} vision ${s.score}/10 → ${s.kept ? "kept" : "rejected"}`;
    case "fallback":
      return `fallback → ${s.to}`;
    default:
      return JSON.stringify(s);
  }
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}
