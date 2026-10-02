// Moneyline odds maths (pure, unit tested). Nothing here is betting advice: it compares the
// bookmakers' prices with our model's probability, and the page says so.

export interface BookOdds {
  vendor: string;
  p1: number | null; // American odds, e.g. -150 or +130
  p2: number | null;
}

/** American → decimal odds (stake included): -150 → 1.667, +130 → 2.30. */
export function americanToDecimal(american: number): number {
  return american > 0 ? 1 + american / 100 : 1 + 100 / Math.abs(american);
}

export function decimalToAmerican(decimal: number): number {
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1));
}

export function formatAmerican(american: number): string {
  return american > 0 ? `+${american}` : String(american);
}

/** A book's implied probabilities with its margin removed (they sum to 1), plus that margin. */
export function noVig(p1American: number, p2American: number): { p1: number; p2: number; margin: number } {
  const r1 = 1 / americanToDecimal(p1American);
  const r2 = 1 / americanToDecimal(p2American);
  return { p1: r1 / (r1 + r2), p2: r2 / (r1 + r2), margin: r1 + r2 - 1 };
}

export interface MarketSummary {
  books: number;
  /** Best (highest) price available for each player, and where. */
  best1: { american: number; decimal: number; vendor: string } | null;
  best2: { american: number; decimal: number; vendor: string } | null;
  /** Consensus fair probability for player 1: median of the books' no-margin probabilities. */
  fair1: number | null;
  /** Average bookmaker margin, e.g. 0.05 = 5%. */
  margin: number | null;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

export function summarizeMarket(books: BookOdds[]): MarketSummary {
  const priced = books.filter((b) => b.p1 !== null && b.p2 !== null && b.p1 !== 0 && b.p2 !== 0) as { vendor: string; p1: number; p2: number }[];
  if (priced.length === 0) return { books: 0, best1: null, best2: null, fair1: null, margin: null };
  const best = (side: "p1" | "p2") => {
    const top = priced.reduce((a, b) => (americanToDecimal(b[side]) > americanToDecimal(a[side]) ? b : a));
    return { american: top[side], decimal: americanToDecimal(top[side]), vendor: top.vendor };
  };
  const fair = priced.map((b) => noVig(b.p1, b.p2));
  return {
    books: priced.length,
    best1: best("p1"),
    best2: best("p2"),
    fair1: median(fair.map((f) => f.p1)),
    margin: fair.reduce((s, f) => s + f.margin, 0) / fair.length,
  };
}

export interface Edge {
  side: 1 | 2;
  model: number; // model probability for this side
  market: number; // consensus fair probability for this side
  edge: number; // model - market (percentage points as a fraction)
  /** Expected profit per 1 unit staked at the best price, if the model were right. */
  ev: number;
  price: { american: number; decimal: number; vendor: string };
}

/**
 * Where the model and the market disagree most, from the side the model favours relative to the
 * market. `ev` assumes the model's probability is correct, which is the big assumption.
 */
export function modelEdge(modelP1: number, market: MarketSummary): Edge | null {
  if (market.fair1 === null || !market.best1 || !market.best2) return null;
  const candidates: Edge[] = [
    { side: 1, model: modelP1, market: market.fair1, edge: modelP1 - market.fair1, ev: modelP1 * market.best1.decimal - 1, price: market.best1 },
    { side: 2, model: 1 - modelP1, market: 1 - market.fair1, edge: market.fair1 - modelP1, ev: (1 - modelP1) * market.best2.decimal - 1, price: market.best2 },
  ];
  return candidates.reduce((a, b) => (b.ev > a.ev ? b : a));
}
