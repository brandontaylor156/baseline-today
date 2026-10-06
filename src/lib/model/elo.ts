// Tennis Elo with surface ratings (the method popularised by FiveThirtyEight and Tennis Abstract).
// Pure and unit tested. Ratings start at 1500; the K-factor shrinks as a player's match count
// grows, so new players move fast and established ones slowly.

export type Surface = "hard" | "clay" | "grass";

export interface EloMatch {
  key1: string; // stable player key (our id, or a normalized name for unlinked players)
  key2: string;
  winner: 1 | 2;
  surface: Surface | null;
  /** Sort key: tournament start date, then round order. */
  order: string;
  /** The winner's share of the games played (completed matches), for margin-of-victory updates. */
  winnerShare?: number | null;
}

export interface Rating {
  overall: number;
  surface: Record<Surface, number>;
  matches: number;
  surfaceMatches: Record<Surface, number>;
}

export const START = 1500;
/** Weight of the surface rating in surface-specific predictions. */
export const SURFACE_WEIGHT = 0.5;

/**
 * Margin of victory: the K-factor scales with the winner's share of the games (Kovalchik 2020;
 * Angelini, Candila & De Angelis 2022). Backtested on 2018–2026 with season-ahead calibration, the
 * log loss fell from 0.6224 to 0.6195 (ATP) and 0.6299 to 0.6252 (WTA). A 50/50 win moves ratings
 * 0.65×, a typical 60% win about 1×, a rout up to 2.6×; retirements (no share) get the base 0.65×.
 */
export const MOV = { scale: 0.65, weight: 3 };
export const marginMultiplier = (share: number | null | undefined) => MOV.scale * (share == null ? 1 : 1 + MOV.weight * (2 * share - 1));

/** FiveThirtyEight-style K-factor: 250 / (matches + 5)^0.4. */
export function kFactor(matches: number): number {
  return 250 / Math.pow(matches + 5, 0.4);
}

export function expected(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

export function newRating(): Rating {
  return { overall: START, surface: { hard: START, clay: START, grass: START }, matches: 0, surfaceMatches: { hard: 0, clay: 0, grass: 0 } };
}

export function normalizeSurface(surface: string | null | undefined): Surface | null {
  const s = (surface ?? "").toLowerCase();
  if (s.includes("clay")) return "clay";
  if (s.includes("grass")) return "grass";
  if (s.includes("hard") || s.includes("carpet") || s.includes("indoor")) return "hard";
  return null;
}

/** Win probability for A over B, blending overall and surface ratings when the surface is known. */
export function winProbability(a: Rating, b: Rating, surface: Surface | null): number {
  const overall = expected(a.overall, b.overall);
  if (!surface) return overall;
  const onSurface = expected(a.surface[surface], b.surface[surface]);
  return (1 - SURFACE_WEIGHT) * overall + SURFACE_WEIGHT * onSurface;
}

export interface Prediction {
  match: EloMatch;
  p1: number; // model probability that player 1 wins, before the match updates ratings
}

/** Updates both players' overall (and surface, when known) ratings after one match. */
export function updateRatings(a: Rating, b: Rating, winner: 1 | 2, surface: Surface | null, mult = 1): void {
  const s1 = winner === 1 ? 1 : 0;
  const eOverall = expected(a.overall, b.overall);
  const kA = kFactor(a.matches) * mult;
  const kB = kFactor(b.matches) * mult;
  a.overall += kA * (s1 - eOverall);
  b.overall += kB * (1 - s1 - (1 - eOverall));
  a.matches++;
  b.matches++;

  if (surface) {
    const eSurface = expected(a.surface[surface], b.surface[surface]);
    a.surface[surface] += kFactor(a.surfaceMatches[surface]) * mult * (s1 - eSurface);
    b.surface[surface] += kFactor(b.surfaceMatches[surface]) * mult * (1 - s1 - (1 - eSurface));
    a.surfaceMatches[surface]++;
    b.surfaceMatches[surface]++;
  }
}

/**
 * Runs Elo over matches in chronological order. Returns final ratings and, for every match, the
 * pre-match prediction (used for backtesting and for "upsets at the time").
 */
export function runElo(
  matches: EloMatch[],
  /** Called after each match with both players' updated ratings (for rating history). */
  onMatch?: (m: EloMatch, a: Rating, b: Rating) => void,
  /** K-factor multiplier per match (margin of victory); 1 when omitted. */
  kMultiplier?: (m: EloMatch) => number,
): { ratings: Map<string, Rating>; predictions: Prediction[] } {
  const ratings = new Map<string, Rating>();
  const get = (k: string) => {
    let r = ratings.get(k);
    if (!r) ratings.set(k, (r = newRating()));
    return r;
  };
  const predictions: Prediction[] = [];

  for (const m of [...matches].sort((x, y) => x.order.localeCompare(y.order))) {
    const a = get(m.key1);
    const b = get(m.key2);
    const p1 = winProbability(a, b, m.surface);
    predictions.push({ match: m, p1 });

    updateRatings(a, b, m.winner, m.surface, kMultiplier?.(m) ?? 1);
    onMatch?.(m, a, b);
  }
  return { ratings, predictions };
}

const logit = (p: number) => Math.log(p / (1 - p));
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/** Shrinks overconfident probabilities toward 50%: p' = sigmoid(c · logit(p)), c ≤ 1. */
export function calibrate(p: number, c: number): number {
  const q = Math.min(1 - 1e-9, Math.max(1e-9, p));
  return sigmoid(c * logit(q));
}

/** The factor c that minimizes log-loss on a set of predictions (golden-section search on 0.3–1.5). */
export function fitCalibration(predictions: Prediction[]): number {
  const loss = (c: number) =>
    predictions.reduce((sum, { match, p1 }) => {
      const p = calibrate(p1, c);
      return sum - (match.winner === 1 ? Math.log(p) : Math.log(1 - p));
    }, 0);
  let lo = 0.3;
  let hi = 1.5;
  const g = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 60; i++) {
    const a = hi - g * (hi - lo);
    const b = lo + g * (hi - lo);
    if (loss(a) < loss(b)) hi = b;
    else lo = a;
  }
  return (lo + hi) / 2;
}

/** Backtest metrics over predictions (e.g. one season, after earlier seasons warmed ratings up). */
export function evaluate(predictions: Prediction[]) {
  if (predictions.length === 0) return { n: 0, accuracy: 0, brier: 0, logLoss: 0, calibration: [] as { bucket: string; n: number; predicted: number; actual: number }[] };
  let correct = 0;
  let brier = 0;
  let logLoss = 0;
  const buckets = new Map<number, { n: number; pSum: number; wins: number }>();
  for (const { match, p1 } of predictions) {
    // Score from the favourite's side so calibration buckets are 50–100%.
    const pFav = Math.max(p1, 1 - p1);
    const favWon = (p1 >= 0.5 ? 1 : 2) === match.winner;
    if (favWon) correct++;
    const y = match.winner === 1 ? 1 : 0;
    brier += (p1 - y) ** 2;
    const p = Math.min(1 - 1e-9, Math.max(1e-9, p1));
    logLoss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
    const bucket = Math.min(9, Math.floor(pFav * 10));
    const bk = buckets.get(bucket) ?? { n: 0, pSum: 0, wins: 0 };
    bk.n++;
    bk.pSum += pFav;
    if (favWon) bk.wins++;
    buckets.set(bucket, bk);
  }
  const n = predictions.length;
  return {
    n,
    accuracy: correct / n,
    brier: brier / n,
    logLoss: logLoss / n,
    calibration: [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([b, v]) => ({ bucket: `${b * 10}–${b * 10 + 10}%`, n: v.n, predicted: v.pSum / v.n, actual: v.wins / v.n })),
  };
}

/**
 * Best-of-5 chance from a best-of-3 one: solve for the per-set chance s with
 * P3(s) = s²(3 − 2s), then P5(s) = s³(10 − 15s + 6s²). Longer matches favour the stronger player.
 */
export function bestOfFive(p3: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 50; i++) {
    const s = (lo + hi) / 2;
    if (s * s * (3 - 2 * s) < p3) lo = s;
    else hi = s;
  }
  const s = (lo + hi) / 2;
  return s ** 3 * (10 - 15 * s + 6 * s * s);
}
