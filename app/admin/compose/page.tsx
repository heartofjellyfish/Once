import { composeAction } from "../actions";

export default async function ComposePage({
  searchParams
}: {
  searchParams: Promise<{ err?: string }>;
}) {
  const sp = await searchParams;
  const errMsg = sp.err;

  return (
    <section>
      <h2>compose</h2>
      <p className="lede">
        Write a headline and name a city — that's enough. Once resolves
        the city (timezone, currency, prices, language, location) and
        rewrites the headline in Once's voice. Photo is scraped from
        source_url if given, else a watercolor map of the city is used.
      </p>

      {errMsg ? <div className="err">⚠ {errMsg}</div> : null}

      <form action={composeAction} className="form">
        <label>headline
          <input
            name="headline"
            required
            placeholder="天津出现强降雨，部分街道积水已到膝盖，有人用充气船在路上划行"
          />
        </label>

        <label>city
          <input
            name="city"
            required
            placeholder="Tianjin / 天津 / Haidian, Beijing / Antigua"
            autoComplete="off"
          />
          <span className="hint">
            free text — city name, district, or any common spelling. First
            time you name a city, Once adds it to the cities table with
            full metadata (~$0.001).
          </span>
        </label>

        <label>body (optional — extra detail, 1-2 sentences)
          <textarea name="body" rows={3} />
        </label>

        <div className="row">
          <label>photo_url (optional override)
            <input name="photo_url" placeholder="https://... (else auto)" />
          </label>
          <label>source_url (optional — scraped for photo + shown as link)
            <input name="source_url" placeholder="https://..." />
          </label>
        </div>

        <label>source_name (optional)
          <input name="source_name" placeholder="e.g. SoraNews24 · own observation" />
        </label>

        <div className="buttons">
          <button type="submit" className="primary">
            publish &amp; pin to homepage
          </button>
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
          gap: 16px;
          max-width: 680px;
        }
        .row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
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
        .hint {
          text-transform: none;
          letter-spacing: normal;
          font-size: 11.5px;
          color: var(--ink-faint);
          line-height: 1.45;
          margin-top: 2px;
        }
        input, textarea {
          font-family: var(--sans);
          font-size: 14px;
          padding: 9px 10px;
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
          padding: 10px 18px;
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
