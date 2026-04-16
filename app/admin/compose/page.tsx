import { composeAction } from "../actions";

export default function ComposePage() {
  return (
    <section>
      <h2>compose</h2>
      <p className="lede">
        Hand-write a story. No AI is invoked — this path costs nothing and
        publishes directly.
      </p>

      <form action={composeAction} className="form">
        <div className="row">
          <label>city
            <input name="city" required placeholder="Lisboa" />
          </label>
          <label>region
            <input name="region" placeholder="Lisboa" />
          </label>
          <label>country
            <input name="country" required placeholder="Portugal" />
          </label>
        </div>

        <div className="row">
          <label>timezone (IANA)
            <input name="timezone" required placeholder="Europe/Lisbon" />
          </label>
          <label>local_hour (0–23)
            <input name="local_hour" type="number" min={0} max={23} defaultValue={12} />
          </label>
          <label>original_language
            <input name="original_language" required placeholder="pt" />
          </label>
        </div>

        <label>original_text (local language)
          <textarea name="original_text" required rows={3} />
        </label>
        <label>english_text (leave blank if original is English)
          <textarea name="english_text" rows={3} />
        </label>

        <div className="row">
          <label>currency_code
            <input name="currency_code" required placeholder="EUR" />
          </label>
          <label>currency_symbol
            <input name="currency_symbol" required placeholder="€" />
          </label>
        </div>

        <div className="row">
          <label>milk (local)
            <input name="milk_price_local" type="number" step="0.01" required />
          </label>
          <label>milk (USD)
            <input name="milk_price_usd" type="number" step="0.01" required />
          </label>
          <label>eggs (local)
            <input name="eggs_price_local" type="number" step="0.01" required />
          </label>
          <label>eggs (USD)
            <input name="eggs_price_usd" type="number" step="0.01" required />
          </label>
        </div>

        <label>photo_url (optional)
          <input name="photo_url" placeholder="https://..." />
        </label>
        <label>source_name (optional)
          <input name="source_name" placeholder="own observation" />
        </label>

        <div className="buttons">
          <button type="submit" className="primary">publish</button>
          <a href="/admin">cancel</a>
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
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
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
          padding: 8px 10px;
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
          gap: 12px;
          align-items: center;
          margin-top: 8px;
        }
        button.primary {
          font-family: var(--sans);
          font-size: 12px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          padding: 10px 16px;
          background: var(--ink);
          color: var(--bg);
          border: 1px solid var(--ink);
          border-radius: 3px;
          cursor: pointer;
        }
        .buttons a {
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-muted);
          text-decoration: none;
        }
      `}</style>
    </section>
  );
}
