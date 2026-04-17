import { notFound } from "next/navigation";
import { requireSql } from "@/lib/db";
import { patchStoryAction } from "../../actions";

interface StoryRow {
  id: string;
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
  source_url: string | null;
}

export default async function StoryEditPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sql = requireSql();
  const rows = (await sql`
    select id, photo_url, country, region, city, timezone, local_hour,
           original_language, original_text, english_text,
           currency_code, currency_symbol, source_url
    from stories where id = ${id}
  `) as unknown as StoryRow[];
  if (rows.length === 0) notFound();
  const r = rows[0];

  return (
    <section>
      <h2>edit published story</h2>
      <p className="lede">
        <code>{r.id}</code> — edits take effect immediately on the homepage.
      </p>

      <form action={patchStoryAction} className="form">
        <input type="hidden" name="story_id" value={r.id} />

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
            <input name="timezone" required defaultValue={r.timezone ?? ""} placeholder="Asia/Shanghai" />
          </label>
          <label>local_hour (0–23)
            <input name="local_hour" type="number" min={0} max={23} defaultValue={String(r.local_hour ?? 12)} />
          </label>
          <label>original_language
            <input name="original_language" defaultValue={r.original_language ?? ""} placeholder="zh" />
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
            <input name="currency_code" defaultValue={r.currency_code ?? ""} placeholder="CNY" />
          </label>
          <label>currency_symbol
            <input name="currency_symbol" defaultValue={r.currency_symbol ?? ""} placeholder="¥" />
          </label>
        </div>

        <label>photo_url
          <input name="photo_url" defaultValue={r.photo_url ?? ""} placeholder="https://..." />
        </label>
        <label>source_url
          <input name="source_url" defaultValue={r.source_url ?? ""} />
        </label>

        <div className="buttons">
          <button type="submit" className="primary">save changes</button>
          <a href="/admin?tab=approved">cancel</a>
        </div>
      </form>

      <style>{`
        h2 {
          font-family: var(--serif);
          font-weight: 400;
          font-size: 20px;
          margin: 0;
        }
        .lede {
          color: var(--ink-muted);
          font-size: 13px;
          margin: 4px 0 16px;
        }
        .lede code {
          font-family: var(--mono);
          font-size: 12px;
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
