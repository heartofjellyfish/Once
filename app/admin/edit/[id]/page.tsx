import { notFound } from "next/navigation";
import { requireSql } from "@/lib/db";
import { approveAction } from "../../actions";

interface QueueRow {
  id: string;
  status: string;
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
  source_url: string | null;
  ai_rationale: string | null;
}

export default async function EditPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ err?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const errMsg = sp.err;
  const sql = requireSql();
  const rows = (await sql`
    select id, status, photo_url, country, region, city, timezone, local_hour,
           original_language, original_text, english_text,
           currency_code, currency_symbol,
           milk_price_local::float8 as milk_price_local,
           eggs_price_local::float8 as eggs_price_local,
           milk_price_usd::float8   as milk_price_usd,
           eggs_price_usd::float8   as eggs_price_usd,
           source_url, ai_rationale
    from moderation_queue where id=${id}
  `) as unknown as QueueRow[];
  if (rows.length === 0) notFound();
  const r = rows[0];

  return (
    <section>
      <h2>edit candidate</h2>
      {errMsg ? (
        <div className="err">⚠ {errMsg}</div>
      ) : null}
      {r.ai_rationale ? (
        <p className="rationale">AI: {r.ai_rationale}</p>
      ) : null}

      <form action={approveAction} className="form">
        <input type="hidden" name="id" value={r.id} />

        <div className="row">
          <label>city
            <input name="city" required defaultValue={r.city ?? ""} />
          </label>
          <label>region
            <input name="region" defaultValue={r.region ?? ""} />
          </label>
          <label>country
            <input name="country" required defaultValue={r.country ?? ""} />
          </label>
        </div>

        <div className="row">
          <label>timezone (IANA)
            <input name="timezone" required defaultValue={r.timezone ?? ""} placeholder="Europe/Lisbon" />
          </label>
          <label>local_hour (0–23)
            <input name="local_hour" type="number" min={0} max={23} defaultValue={String(r.local_hour ?? 12)} />
          </label>
          <label>original_language
            <input name="original_language" defaultValue={r.original_language ?? ""} placeholder="pt" />
          </label>
        </div>

        <label>original_text
          <textarea name="original_text" required rows={3} defaultValue={r.original_text ?? ""} />
        </label>
        <label>english_text (blank if original is English)
          <textarea name="english_text" rows={3} defaultValue={r.english_text ?? ""} />
        </label>

        <div className="row">
          <label>currency_code
            <input name="currency_code" defaultValue={r.currency_code ?? ""} placeholder="EUR" />
          </label>
          <label>currency_symbol
            <input name="currency_symbol" defaultValue={r.currency_symbol ?? ""} placeholder="€" />
          </label>
        </div>

        <div className="row">
          <label>milk (local)
            <input name="milk_price_local" type="number" step="0.01" defaultValue={String(r.milk_price_local ?? 0)} />
          </label>
          <label>milk (USD)
            <input name="milk_price_usd" type="number" step="0.01" defaultValue={String(r.milk_price_usd ?? 0)} />
          </label>
          <label>eggs (local)
            <input name="eggs_price_local" type="number" step="0.01" defaultValue={String(r.eggs_price_local ?? 0)} />
          </label>
          <label>eggs (USD)
            <input name="eggs_price_usd" type="number" step="0.01" defaultValue={String(r.eggs_price_usd ?? 0)} />
          </label>
        </div>

        <label>photo_url (optional)
          <input name="photo_url" defaultValue={r.photo_url ?? ""} placeholder="https://..." />
        </label>
        <label>source_url (optional)
          <input name="source_url" defaultValue={r.source_url ?? ""} />
        </label>

        <div className="buttons">
          <button type="submit" className="primary">approve &amp; publish</button>
          <a href="/admin">cancel</a>
        </div>
      </form>

      <style>{`
        .err {
          padding: 10px 12px;
          border-radius: 3px;
          font-size: 13px;
          font-family: var(--mono);
          background: rgba(168, 90, 60, 0.1);
          color: var(--accent-dark, #8a3a2a);
          margin-bottom: 4px;
        }
        h2 {
          font-family: var(--serif);
          font-weight: 400;
          font-size: 20px;
          margin: 0;
        }
        .rationale {
          color: var(--ink-muted);
          font-size: 13px;
          margin: 0;
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
          font-size: 15px;
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
