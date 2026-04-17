import type { Metadata } from "next";
import Link from "next/link";
import { dbAvailable } from "@/lib/db";
import AdminNav from "./_components/AdminNav";
import {
  weeklySpend,
  weeklyRemaining,
  WEEKLY_BUDGET_USD
} from "@/lib/budget";

export const metadata: Metadata = {
  title: "admin",
  robots: { index: false, follow: false }
};

// Admin pages must always be fresh.
export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children
}: {
  children: React.ReactNode;
}) {
  let spent = 0;
  let remaining = WEEKLY_BUDGET_USD;
  let dbReady = dbAvailable();

  if (dbReady) {
    try {
      spent = await weeklySpend();
      remaining = await weeklyRemaining();
    } catch {
      dbReady = false;
    }
  }

  const pctUsed = Math.min(100, (spent / WEEKLY_BUDGET_USD) * 100);

  return (
    <div className="wrap">
      <header>
        <div className="top">
          <Link href="/admin" className="brand">
            Once · admin
          </Link>
          <AdminNav />
        </div>

        {dbReady ? (
          <div className="budget">
            <div className="bar">
              <div className="bar-fill" style={{ width: `${pctUsed}%` }} />
            </div>
            <div className="stats">
              <span>
                AI budget this week:&nbsp;
                <strong>${spent.toFixed(4)}</strong>
                &nbsp;of&nbsp;
                <strong>${WEEKLY_BUDGET_USD.toFixed(2)}</strong>
                &nbsp;used
              </span>
              <span className="remaining">
                ${remaining.toFixed(4)} remaining
              </span>
            </div>
          </div>
        ) : (
          <div className="warn">
            DATABASE_URL not set — admin is inoperative. Add it to
            .env.local, run <code>npm run db:migrate</code>, then{" "}
            <code>npm run db:seed</code>.
          </div>
        )}
      </header>

      <main>{children}</main>

      <style>{`
        .wrap {
          width: 100%;
          max-width: 880px;
          margin: 0 auto;
          padding: 24px 20px 96px;
          font-family: var(--sans);
          color: var(--ink);
        }

        header {
          border-bottom: 1px solid var(--hairline);
          padding-bottom: 16px;
          margin-bottom: 28px;
        }

        .top {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 16px;
          flex-wrap: wrap;
        }

        .brand {
          font-family: var(--serif);
          font-size: 18px;
          color: var(--ink);
          text-decoration: none;
          letter-spacing: 0.01em;
        }

        .budget {
          margin-top: 14px;
          font-size: 12px;
        }
        .bar {
          width: 100%;
          height: 3px;
          background: var(--hairline);
          border-radius: 2px;
          overflow: hidden;
        }
        .bar-fill {
          height: 100%;
          background: var(--ink-muted);
          transition: width 400ms ease;
        }
        .stats {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          color: var(--ink-muted);
          font-variant-numeric: tabular-nums;
        }
        .stats .remaining { color: var(--ink-faint); }

        .warn {
          margin-top: 14px;
          padding: 10px 12px;
          border: 1px solid var(--hairline);
          border-radius: 4px;
          font-size: 13px;
          color: var(--ink-muted);
          background: transparent;
        }
        .warn code {
          font-family: var(--mono);
          font-size: 12px;
          color: var(--ink);
        }

        main {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }
      `}</style>
    </div>
  );
}
