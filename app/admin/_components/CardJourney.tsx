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

// Friendlier labels for the body-fetch method. The raw values
// ("readability", "og", etc.) are engineering jargon.
const BODY_METHOD_LABEL: Record<string, string> = {
  jsonld: "JSON-LD",
  readability: "Reader View",
  og: "OG meta",
  rss_fallback: "RSS only",
  error: "fetch failed"
};
const BODY_METHOD_BAD = new Set(["rss_fallback", "error"]);

// Source host → publication name. Falls back to the host if unknown.
// Small curated list for the feeds we actually use.
const PUBLICATION: Record<string, string> = {
  "soranews24.com": "SoraNews24",
  "nippon.com": "Nippon.com",
  "thesoulofseoul.net": "Soul of Seoul",
  "taipeitimes.com": "Taipei Times",
  "sixthtone.com": "Sixth Tone",
  "whatsonweibo.com": "What's on Weibo",
  "radii.co": "RADII China",
  "thatsmags.com": "That's Mags",
  "saigoneer.com": "Saigoneer",
  "hindustantimes.com": "Hindustan Times",
  "dailysabah.com": "Daily Sabah",
  "tehrantimes.com": "Tehran Times",
  "atlaslisboa.com": "Atlas Lisboa",
  "finland.fi": "thisisFINLAND",
  "sloveniatimes.com": "Slovenia Times",
  "nv.ua": "New Voice of Ukraine",
  "english.nv.ua": "New Voice of Ukraine",
  "icelandreview.com": "Iceland Review",
  "gothamist.com": "Gothamist",
  "antigravitymagazine.com": "Antigravity Magazine",
  "theoaxacapost.com": "Oaxaca Post",
  "orgulloporteno.cl": "Orgullo Porteño",
  "quepasa.gt": "Qué Pasa Magazine",
  "premiumtimesng.com": "Premium Times Nigeria",
  "standardmedia.co.ke": "Standard Kenya",
  "dailymaverick.co.za": "Daily Maverick",
  "hakaimagazine.com": "Hakai Magazine",
  "abc.net.au": "ABC Melbourne",
  "timesca.com": "Times of Central Asia",
  "astanatimes.com": "Astana Times",
  "thediplomat.com": "The Diplomat",
  "oncubanews.com": "On Cuba News",
  "jamaicaobserver.com": "Jamaica Observer",
  "ayibopost.com": "AyiboPost",
  "peruviantimes.com": "Peruvian Times",
  "mongabay.com": "Mongabay",
  "folha.uol.com.br": "Folha de S.Paulo",
  "piaui.folha.uol.com.br": "Piauí",
  "inkyfada.com": "Inkyfada",
  "nawaat.org": "Nawaat",
  "madamasr.com": "Mada Masr",
  "religionunplugged.com": "Religion Unplugged",
  "civilbeat.org": "Honolulu Civil Beat",
  "rnz.co.nz": "RNZ Pacific",
  "himalmag.com": "Himal Southasian",
  "tempo.co": "Tempo",
  "coconuts.co": "Coconuts Bali",
  "oregonlive.com": "Oregon Live",
  "montrealgazette.com": "Montreal Gazette",
  "cbc.ca": "CBC",
  "restofworld.org": "Rest of World",
  "globalvoices.org": "Global Voices",
  "reddit.com": "Reddit"
};

function publicationName(host: string | null | undefined): string {
  if (!host) return "?";
  // Strip leading "www." and try exact match
  const h = host.replace(/^www\./, "");
  if (PUBLICATION[h]) return PUBLICATION[h];
  // Try parent domain match (e.g. `en.madamasr.com` → `madamasr.com`)
  const parts = h.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    const sub = parts.slice(i).join(".");
    if (PUBLICATION[sub]) return PUBLICATION[sub];
  }
  return h; // fall back to host
}

export function CardJourney({ journey }: { journey: Journey | null }) {
  const [open, setOpen] = useState(false);
  if (!journey) return null;

  const totals = journey.totals ?? { cost_usd: 0, ms: 0, tokens: 0 };
  const costUsd = Number(totals.cost_usd ?? 0);
  const ms = Number(totals.ms ?? 0);

  // Cost banding: <$0.02 normal, $0.02–$0.05 yellow, $0.05+ red.
  const costClass =
    costUsd >= 0.05 ? "cost-red" :
    costUsd >= 0.02 ? "cost-yellow" :
    "cost-ok";

  const photoSteps = Array.isArray(journey.photo?.steps)
    ? journey.photo.steps
    : [];

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
              <strong>{publicationName(journey.source.source_host)}</strong>
              {" · "}
              <span className="dim">{journey.source.kind}</span>
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
              <span className={journey.prefilter.pass ? "ok-pill" : "fail-pill"}>
                {journey.prefilter.pass ? "PASS" : "FAIL"}
              </span>
              {journey.prefilter.why && (
                <Quote text={journey.prefilter.why} />
              )}
              <SubLine
                tokens={{
                  p: journey.prefilter.prompt_tokens,
                  c: journey.prefilter.cached_tokens,
                  o: journey.prefilter.completion_tokens
                }}
                ms={journey.prefilter.ms}
                cost={journey.prefilter.cost_usd}
              />
            </Row>
          )}

          {journey.body && (
            <Row label="Body">
              <span className={BODY_METHOD_BAD.has(journey.body.method) ? "fail" : "dim"}>
                {BODY_METHOD_LABEL[journey.body.method] ?? journey.body.method}
              </span>
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
              {journey.body.preview && (
                <Quote text={journey.body.preview} />
              )}
              <SubLine ms={journey.body.ms} />
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
                <Quote text={journey.score.rationale} />
              )}
              <SubLine
                tokens={{
                  p: journey.score.prompt_tokens,
                  c: journey.score.cached_tokens,
                  o: journey.score.completion_tokens
                }}
                ms={journey.score.ms}
                cost={journey.score.cost_usd}
              />
            </Row>
          )}

          {journey.rewrite && (
            <Row label="Rewrite">
              <code>{journey.rewrite.model}</code>
              {" · "}
              <span className="dim">{journey.rewrite.length} chars</span>
              {journey.rewrite.preview && (
                <Quote text={journey.rewrite.preview} />
              )}
              <SubLine
                tokens={{
                  p: journey.rewrite.prompt_tokens,
                  c: journey.rewrite.cached_tokens,
                  o: journey.rewrite.completion_tokens
                }}
                ms={journey.rewrite.ms}
                cost={journey.rewrite.cost_usd}
              />
            </Row>
          )}

          {journey.photo && (
            <Row label="Photo">
              <code>{journey.photo.source ?? "?"}</code>
              {photoSteps.length > 0 && (
                <>
                  {" · "}
                  <span className="dim">
                    {photoSteps.length} attempt{photoSteps.length === 1 ? "" : "s"}
                  </span>
                </>
              )}
              <SubLine
                ms={journey.photo.ms > 0 ? journey.photo.ms : undefined}
                cost={journey.photo.cost_usd}
              />
              {photoSteps.length > 0 && (
                <div className="photo-steps">
                  {photoSteps.map(
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (s: any, i: number) => (
                      <div key={i} className="photo-step">
                        <span className="bullet">•</span>{" "}
                        <span dangerouslySetInnerHTML={{
                          __html: photoStepLabel(s)
                        }} />
                      </div>
                    )
                  )}
                </div>
              )}
            </Row>
          )}

          <div className="totals">
            <span className="totals-label">TOTAL</span>
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
          gap: 10px;
        }
        .journey-body code {
          font-family: var(--mono, ui-monospace, monospace);
          font-size: 10.5px;
          color: var(--ink);
        }
        .journey-body strong {
          font-family: var(--sans, system-ui, sans-serif);
          font-weight: 500;
          color: var(--ink);
        }
        .row {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .row-head {
          display: flex;
          gap: 10px;
          align-items: baseline;
        }
        .row-label {
          min-width: 72px;
          color: var(--ink-faint);
          text-transform: uppercase;
          letter-spacing: 0.12em;
          font-size: 10px;
          flex-shrink: 0;
        }
        .row-main { flex: 1; min-width: 0; }

        .quote {
          display: block;
          margin-top: 4px;
          padding: 3px 8px;
          border-left: 2px solid var(--hairline);
          font-family: var(--serif, Georgia, serif);
          font-style: italic;
          font-size: 11.5px;
          color: var(--ink-muted);
          line-height: 1.4;
        }

        .subline {
          display: block;
          margin-top: 3px;
          color: var(--ink-faint);
          font-size: 10px;
        }

        .dim { color: var(--ink-muted); }
        .dim-link {
          color: var(--ink-muted);
          text-decoration: none;
          border-bottom: 1px dotted var(--hairline);
        }
        .ok { color: #3f5e28; }
        .fail { color: #8a3520; }
        .ok-pill {
          background: rgba(109, 140, 72, 0.18);
          color: #3f5e28;
          padding: 1px 6px;
          border-radius: 2px;
          font-size: 9.5px;
          letter-spacing: 0.1em;
          font-weight: 500;
        }
        .fail-pill {
          background: rgba(168, 90, 60, 0.18);
          color: #8a3520;
          padding: 1px 6px;
          border-radius: 2px;
          font-size: 9.5px;
          letter-spacing: 0.1em;
        }

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
          margin-top: 4px;
          color: var(--ink-faint);
          font-size: 10.5px;
        }
        .photo-step { padding: 1px 0; line-height: 1.45; }
        .photo-step .bullet {
          color: var(--ink-faint);
          margin-right: 2px;
          display: inline-block;
          width: 10px;
        }
        .photo-step .kept {
          color: #3f5e28;
          font-weight: 500;
        }
        .photo-step .rejected {
          color: var(--ink-faint);
        }

        .totals {
          margin-top: 2px;
          padding-top: 8px;
          border-top: 1px dashed var(--hairline);
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          font-size: 10.5px;
        }
        .totals-label {
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--ink-muted);
          font-weight: 500;
        }
      `}</style>
    </div>
  );
}

/** Label + main content column. */
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

/** Italic blockquote for AI rationale / content preview. */
function Quote({ text }: { text: string }) {
  return <span className="quote">{truncate(text, 240)}</span>;
}

/** Bottom sub-line: tokens / ms / cost. Used under each stage. */
function SubLine({
  tokens,
  ms,
  cost
}: {
  tokens?: { p: number; c: number; o: number };
  ms?: number;
  cost?: number;
}) {
  const parts: React.ReactNode[] = [];
  if (tokens) {
    const pct =
      tokens.p > 0 ? Math.round((tokens.c / tokens.p) * 100) : 0;
    parts.push(
      <span key="t">
        {tokens.p} in · {tokens.o} out
        {tokens.c > 0 && (
          <span className="dim"> · {pct}% cached</span>
        )}
      </span>
    );
  }
  if (ms != null && ms > 0) {
    parts.push(<span key="ms">{ms}ms</span>);
  }
  if (cost != null && cost > 0) {
    parts.push(<span key="cost">${cost.toFixed(5)}</span>);
  }
  if (parts.length === 0) return null;
  return (
    <span className="subline">
      {parts.map((p, i) => (
        <span key={i}>
          {i > 0 ? " · " : ""}
          {p}
        </span>
      ))}
    </span>
  );
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
  const esc = (x: string) =>
    String(x)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  switch (s?.step) {
    case "og_skipped":
      return `og: skipped <span class="dim">(${esc(s.reason || "")})</span>`;
    case "og_scraped":
      return s.url ? `og: scraped` : `og: <span class="dim">no image</span>`;
    case "og_judged":
      return `og vision ${s.score}/10 → ${
        s.kept
          ? `<span class="kept">kept ✓</span>`
          : `<span class="rejected">rejected</span>`
      }`;
    case "og_judge_unavailable":
      return `og vision: unavailable <span class="dim">(kept)</span>`;
    case "library_query":
      return `${esc(s.library)}: "${esc(truncate(s.query || "", 40))}" → ${
        s.hit ? "hit" : `<span class="dim">miss</span>`
      }`;
    case "relevance_judged":
      return `${esc(s.library)} vision ${s.score}/10 → ${
        s.kept
          ? `<span class="kept">kept ✓</span>`
          : `<span class="rejected">rejected</span>`
      }`;
    case "fallback":
      return `fallback → ${esc(s.to || "")} <span class="dim">(${esc(s.reason || "")})</span>`;
    default:
      return esc(JSON.stringify(s));
  }
}

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}
