import Link from "next/link";
import { addAction } from "../actions";
import { estimateCurateCost } from "@/lib/curate";
import SendButton from "./SendButton";

type Mode = "url" | "text";

export default async function ManualPage({
  searchParams
}: {
  searchParams: Promise<{ mode?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const mode: Mode = sp.mode === "text" ? "text" : "url";
  const errMsg = sp.err;
  const floor = estimateCurateCost("");

  return (
    <section>
      <h2>manual</h2>
      <p className="lede">
        {mode === "url"
          ? "Paste a news item, social post, or snippet you want Once to consider. GPT-4o-mini renders it in the local language and drops it in the queue for your review."
          : "Write an observation of your own — a small moment, a scene you witnessed. Same Once voice, same queue, same review step."}
      </p>

      <div className="tabs">
        <Link
          href="/admin/manual?mode=url"
          className={mode === "url" ? "active" : ""}
          aria-current={mode === "url" ? "page" : undefined}
        >
          from source
        </Link>
        <Link
          href="/admin/manual?mode=text"
          className={mode === "text" ? "active" : ""}
          aria-current={mode === "text" ? "page" : undefined}
        >
          write your own
        </Link>
      </div>

      {errMsg ? <div className="err">⚠ {errMsg}</div> : null}

      <form action={addAction} className="form">
        <label>{mode === "url" ? "source text" : "your observation"}
          <textarea
            name="source_text"
            required
            rows={mode === "url" ? 10 : 6}
            placeholder={
              mode === "url"
                ? "A bakery on Rua da Bica ran out of sliced bread around 2pm because of roadwork on the avenue…"
                : "At the corner of Rua da Bica, the old man who feeds the street cats put out an extra bowl this morning."
            }
          />
        </label>

        <div className="row">
          <label>city {mode === "text" ? "" : "hint (optional)"}
            <input
              name="city_hint"
              placeholder="Lisboa"
              required={mode === "text"}
            />
          </label>
          {mode === "url" ? (
            <label>source URL (optional)
              <input name="source_url" placeholder="https://publico.pt/..." />
            </label>
          ) : null}
        </div>

        <div className="buttons">
          <SendButton />
          <span className="cost-hint">
            est. cost: ~${floor.toFixed(5)}+ per call (warm cache)
          </span>
        </div>
      </form>

      <style>{`
        h2 {
          font-family: var(--serif);
          font-weight: 400;
          font-size: 20px;
          margin: 0 0 10px;
        }
        .lede {
          color: var(--ink-muted);
          font-size: 14px;
          margin: 0 0 18px;
          max-width: 620px;
          line-height: 1.5;
        }
        .tabs {
          display: flex;
          gap: 18px;
          margin: 0 0 22px;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          border-bottom: 1px solid var(--hairline);
        }
        .tabs a {
          color: var(--ink-faint);
          text-decoration: none;
          padding: 0 0 10px;
          border-bottom: 1.5px solid transparent;
          margin-bottom: -1px;
        }
        .tabs a:hover { color: var(--ink); }
        .tabs a.active {
          color: var(--ink);
          border-bottom-color: var(--ink);
        }
        .err {
          padding: 10px 12px;
          border-radius: 3px;
          font-size: 13px;
          font-family: var(--mono);
          background: rgba(168, 90, 60, 0.1);
          color: var(--accent-dark, #8a3a2a);
          margin-bottom: 14px;
          white-space: pre-wrap;
        }
        .form {
          display: flex;
          flex-direction: column;
          gap: 14px;
          max-width: 680px;
        }
        .row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        label {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 11px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ink-muted);
        }
        input, textarea {
          font-family: var(--sans);
          font-size: 14px;
          padding: 10px 12px;
          border: 1px solid var(--hairline);
          background: transparent;
          color: var(--ink);
          border-radius: 3px;
          text-transform: none;
          letter-spacing: normal;
        }
        textarea {
          font-family: var(--serif);
          font-size: 16px;
          line-height: 1.45;
          resize: vertical;
        }
        input:focus, textarea:focus {
          outline: none;
          border-color: var(--ink-muted);
        }
        .buttons {
          display: flex;
          gap: 14px;
          align-items: center;
          margin-top: 8px;
        }
        button.primary {
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
        .cost-hint {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--ink-faint);
        }
      `}</style>
    </section>
  );
}
