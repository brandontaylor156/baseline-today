// Betting arithmetic (pure, unit tested): odds formats, implied chance, bookmaker margin, fair
// odds, expected value, Kelly stakes, parlays and arbitrage. All odds are handled as decimal.

/** Parses "1.85", "+150", "-120" or "5/2" into decimal odds (> 1), or null. */
export function parseOdds(input: string): number | null {
  const s = input.trim().replace(/\s+/g, "");
  if (!s) return null;
  const frac = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(s);
  if (frac) {
    const d = 1 + Number(frac[1]) / Number(frac[2]);
    return Number.isFinite(d) && d > 1 ? d : null;
  }
  if (/^[+-]\d+(\.\d+)?$/.test(s)) {
    const a = Number(s);
    if (Math.abs(a) < 100) return null;
    return a > 0 ? 1 + a / 100 : 1 + 100 / -a;
  }
  if (/^\d+(\.\d+)?$/.test(s)) {
    const d = Number(s);
    return d > 1 ? d : null;
  }
  return null;
}

export function toAmerican(decimal: number): string {
  const a = decimal >= 2 ? (decimal - 1) * 100 : -100 / (decimal - 1);
  return `${a > 0 ? "+" : ""}${Math.round(a)}`;
}

/** Nearest simple fraction (denominators up to 20), e.g. 3.5 → "5/2". */
export function toFractional(decimal: number): string {
  const x = decimal - 1;
  let best = { n: Math.round(x), d: 1, err: Math.abs(x - Math.round(x)) };
  for (let d = 2; d <= 20; d++) {
    const n = Math.round(x * d);
    const err = Math.abs(x - n / d);
    if (err < best.err - 1e-9) best = { n, d, err };
  }
  return `${best.n}/${best.d}`;
}

/** The chance a price implies, margin included. */
export const impliedChance = (decimal: number) => 1 / decimal;

/** Margin (overround) of a market and its fair, margin-free chances (proportional method). */
export function fairMarket(decimals: number[]): { margin: number; fair: number[]; fairOdds: number[] } {
  const implied = decimals.map(impliedChance);
  const total = implied.reduce((s, p) => s + p, 0);
  const fair = implied.map((p) => p / total);
  return { margin: total - 1, fair, fairOdds: fair.map((p) => 1 / p) };
}

/** Expected profit per 1 staked, if `chance` is the true chance of winning. */
export const expectedValue = (decimal: number, chance: number) => chance * (decimal - 1) - (1 - chance);

/** Kelly fraction of bankroll: (b·p − q) / b with b = decimal − 1; 0 when there's no edge. */
export function kelly(decimal: number, chance: number): number {
  const b = decimal - 1;
  if (b <= 0) return 0;
  return Math.max(0, (b * chance - (1 - chance)) / b);
}

/** Combined decimal odds of a parlay (accumulator), and its implied chance. */
export function parlay(decimals: number[]): { odds: number; chance: number } {
  const odds = decimals.reduce((p, d) => p * d, 1);
  return { odds, chance: 1 / odds };
}

/**
 * Arbitrage across books: with the best price for each outcome, the implied chances sum below 1.
 * Stakes are split so every outcome returns the same amount.
 */
export function arbitrage(best: number[], total: number): { arb: boolean; sum: number; stakes: number[]; payout: number; profit: number } {
  const sum = best.reduce((s, d) => s + 1 / d, 0);
  const stakes = best.map((d) => (total * (1 / d)) / sum);
  const payout = total / sum;
  return { arb: sum < 1, sum, stakes, payout, profit: payout - total };
}
