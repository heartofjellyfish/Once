import { submitCorrespondence } from "./actions";

export const metadata = {
  title: "correspond",
  robots: { index: false, follow: false }
};

export default function CorrespondPage({
  searchParams
}: {
  searchParams: Promise<{ sent?: string; err?: string }>;
}) {
  return <Inner searchParams={searchParams} />;
}

async function Inner({
  searchParams
}: {
  searchParams: Promise<{ sent?: string; err?: string }>;
}) {
  const sp = await searchParams;
  const sent = sp.sent === "1";
  const err = sp.err;

  return (
    <main>
      <h1>write in</h1>
      <p className="lede">
        Something small happened near you — a shop that closed early, a neighbour's
        dog that only crosses the street at the zebra, a 110-year-old who slipped
        away in the afternoon. If it made you pause, it might be a Once moment.
      </p>
      <p className="lede small">
        Submissions go into the editor's queue. Every submission is reviewed by a
        human before it appears on the site. You can write in any language — we'll
        translate.
      </p>

      {sent ? (
        <p className="note ok">
          Got it. Thank you. The editor will see it within the day.
        </p>
      ) : null}
      {err ? <p className="note err">Couldn't save: {err}</p> : null}

      <form action={submitCorrespondence} className="form">
        <div className="row">
          <label>
            city
            <input name="city" required placeholder="Lisboa" maxLength={80} />
          </label>
          <label>
            country
            <input name="country" required placeholder="Portugal" maxLength={80} />
          </label>
        </div>

        <label>
          the moment
          <textarea
            name="text"
            required
            rows={6}
            maxLength={800}
            placeholder="A small cafe on Rua da Bica opened an hour late this morning — the owner's cat was sleeping in front of the door."
          />
        </label>

        <label>
          source link (optional)
          <input
            name="source_url"
            placeholder="https://... — a link if the moment came from somewhere online"
            type="url"
            maxLength={400}
          />
        </label>

        <label>
          your name (optional)
          <input name="name" placeholder="anonymous" maxLength={60} />
        </label>

        <div className="buttons">
          <button type="submit" className="primary">send</button>
          <a href="/" className="back">return</a>
        </div>
      </form>

      <style>{`
        main {
          max-width: 580px;
          margin: 0 auto;
          padding: clamp(48px, 8vh, 96px) clamp(20px, 5vw, 32px) 80px;
          display: flex;
          flex-direction: column;
          gap: 18px;
          font-family: var(--serif);
          color: var(--ink);
        }
        h1 {
          margin: 0;
          font-family: var(--cursive);
          font-size: clamp(30px, 4vw, 40px);
          font-weight: 400;
          color: var(--accent);
          line-height: 1;
        }
        .lede {
          margin: 0;
          font-size: 17px;
          line-height: 1.6;
          color: var(--ink-soft);
          text-wrap: pretty;
        }
        .lede.small { font-size: 14px; color: var(--ink-muted); margin-top: -6px; }
        .note {
          padding: 12px 14px;
          border-radius: 3px;
          font-size: 14px;
        }
        .note.ok { background: rgba(109, 140, 72, 0.12); color: #3f5e28; }
        .note.err { background: rgba(168, 90, 60, 0.12); color: var(--accent-dark); }
        .form {
          display: flex;
          flex-direction: column;
          gap: 14px;
          margin-top: 10px;
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
          line-height: 1.5;
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
        .back {
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-faint);
          text-decoration: none;
        }
      `}</style>
    </main>
  );
}
