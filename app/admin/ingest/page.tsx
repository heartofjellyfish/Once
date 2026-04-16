import { ingestAction } from "../actions";
import { estimateCurateCost } from "@/lib/curate";

export default function IngestPage() {
  // We can't know the user's text yet, so show the fixed-overhead floor
  // (~700 tokens of instructions + tiny user payload) as a rough lower bound.
  const floor = estimateCurateCost("");

  return (
    <section>
      <h2>ingest</h2>
      <p className="lede">
        Paste a snippet of source material — a news item, a social post,
        an observation. GPT-4o-mini will render it in Once's voice in the
        local language and drop it in the queue for your review.
      </p>

      <form action={ingestAction} className="form">
        <label>source text
          <textarea
            name="source_text"
            required
            rows={10}
            placeholder="A bakery on Rua da Bica ran out of sliced bread around 2pm because of roadwork on the avenue…"
          />
        </label>

        <div className="row">
          <label>city hint (optional)
            <input name="city_hint" placeholder="Lisboa" />
          </label>
          <label>source URL (optional)
            <input name="source_url" placeholder="https://publico.pt/..." />
          </label>
        </div>

        <div className="buttons">
          <button type="submit" className="primary">send to AI</button>
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
