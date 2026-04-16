/**
 * Formatting helpers. Prices are shown calmly, not precisely.
 * We avoid Intl.NumberFormat's currency mode because it nudges
 * toward a "financial app" feel. We want the opposite.
 */

export function formatLocal(amount: number, symbol: string): string {
  // Most European currencies use 2 decimals; JPY/KRW etc. use 0.
  const decimals = noDecimalCurrencies.has(symbol) ? 0 : 2;
  const n = amount.toFixed(decimals);
  // Symbol placement: put common suffix-currencies after the number.
  if (suffixSymbols.has(symbol)) return `${n} ${symbol}`;
  return `${symbol}${n}`;
}

export function formatUsd(amount: number): string {
  return `~$${amount.toFixed(2)}`;
}

const noDecimalCurrencies = new Set(["¥", "₩", "₫", "Rp", "Ft", "₮"]);
const suffixSymbols = new Set([
  "kr", "zł", "Kč", "Ft", "lei", "лв", "Ft", "ден", "so'm", "₾", "₺",
  "₴", "ден.", "KM", "₸", "₮", "DH", "Rp", "฿", "₱", "RM"
]);
