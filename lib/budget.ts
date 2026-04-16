import { requireSql } from "./db";

/**
 * AI cost accounting.
 *
 * One row in budget_ledger per OpenAI call. The weekly cutoff is a rolling
 * 7-day sum — at $0.50/week default, gpt-4o-mini can comfortably serve
 * ~1000 curate calls without hitting the ceiling.
 */

export const WEEKLY_BUDGET_USD = Number(
  process.env.AI_BUDGET_USD_PER_WEEK ?? "0.50"
);

/** gpt-4o-mini pricing (Apr 2025). Updated numbers: input $0.15/M, output $0.60/M. */
const PRICING: Record<
  string,
  { input: number; cachedInput: number; output: number }
> = {
  "gpt-4o-mini": {
    input: 0.15 / 1_000_000,
    cachedInput: 0.075 / 1_000_000,
    output: 0.60 / 1_000_000
  },
  "gpt-4o": {
    input: 2.5 / 1_000_000,
    cachedInput: 1.25 / 1_000_000,
    output: 10.0 / 1_000_000
  }
};

export interface UsageBreakdown {
  model: string;
  promptTokens: number;
  cachedTokens: number; // subset of promptTokens
  completionTokens: number;
}

export function estimateCost(u: UsageBreakdown): number {
  const p = PRICING[u.model] ?? PRICING["gpt-4o-mini"];
  const freshPromptTokens = Math.max(0, u.promptTokens - u.cachedTokens);
  return (
    freshPromptTokens * p.input +
    u.cachedTokens * p.cachedInput +
    u.completionTokens * p.output
  );
}

/** USD spent in the last 7 days. Used by the cutoff and the admin UI. */
export async function weeklySpend(): Promise<number> {
  const sql = requireSql();
  const rows = await sql`
    select coalesce(sum(cost_usd), 0)::float8 as total
    from budget_ledger
    where at > now() - interval '7 days'
  `;
  const first = rows[0] as { total: number } | undefined;
  return first?.total ?? 0;
}

export async function weeklyRemaining(): Promise<number> {
  return Math.max(0, WEEKLY_BUDGET_USD - (await weeklySpend()));
}

/** Throws if invoking the AI would exceed the weekly ceiling. */
export async function assertBudget(estimatedCost: number): Promise<void> {
  const spent = await weeklySpend();
  if (spent + estimatedCost > WEEKLY_BUDGET_USD) {
    const err = new Error(
      `AI budget exhausted: $${spent.toFixed(4)} / $${WEEKLY_BUDGET_USD.toFixed(
        2
      )} used this week. Try again after the oldest call ages out of the 7-day window.`
    );
    err.name = "BudgetExhaustedError";
    throw err;
  }
}

export async function recordSpend(
  usage: UsageBreakdown,
  operation: string,
  queueId: string | null = null
): Promise<number> {
  const cost = estimateCost(usage);
  const sql = requireSql();
  await sql`
    insert into budget_ledger
      (model, operation, prompt_tokens, cached_tokens, completion_tokens, cost_usd, queue_id)
    values
      (${usage.model}, ${operation},
       ${usage.promptTokens}, ${usage.cachedTokens}, ${usage.completionTokens},
       ${cost}, ${queueId})
  `;
  return cost;
}
