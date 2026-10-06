// Fragile and ruthless favourites (pure, unit tested). When a player is favoured, the scoreline
// model says how often the match should still go to a deciding set. Players who let favoured
// matches go the distance more than that are "fragile"; fewer, "ruthless". A holdout then asks the
// real question: does fragility measured in the past predict upsets beyond the ratings?

export interface FragilityMatch {
  key1: string;
  key2: string;
  date: string;
  /** Model chance for player 1, and the chance the match goes to a deciding set. */
  p1: number;
  decider: number;
  /** Did it go the distance, and who won. */
  wentDistance: boolean;
  winner: 1 | 2;
}

export interface Fragility {
  key: string;
  /** Favoured matches, deciding sets actual and expected, and the z-score of the gap. */
  matches: number;
  deciders: number;
  expected: number;
  z: number;
  /** Wins and expected wins as favourite. */
  wins: number;
  expectedWins: number;
}

/** Each player's record as the favourite, from matches before `before` (all when omitted). */
export function fragility(matches: FragilityMatch[], before?: string): Map<string, Fragility> {
  type Acc = { n: number; d: number; e: number; v: number; w: number; ew: number };
  const acc = new Map<string, Acc>();
  for (const m of matches) {
    if (before && m.date >= before) continue;
    if (m.p1 === 0.5) continue;
    const fav = m.p1 > 0.5 ? m.key1 : m.key2;
    const pFav = Math.max(m.p1, 1 - m.p1);
    const a = acc.get(fav) ?? { n: 0, d: 0, e: 0, v: 0, w: 0, ew: 0 };
    a.n++;
    a.d += m.wentDistance ? 1 : 0;
    a.e += m.decider;
    a.v += m.decider * (1 - m.decider);
    a.w += (m.winner === 1) === (fav === m.key1) ? 1 : 0;
    a.ew += pFav;
    acc.set(fav, a);
  }
  return new Map(
    [...acc].map(([key, a]) => [key, { key, matches: a.n, deciders: a.d, expected: a.e, z: a.v > 0 ? (a.d - a.e) / Math.sqrt(a.v) : 0, wins: a.w, expectedWins: a.ew }]),
  );
}

/** Fragility as a predictor: z shrunk toward zero for small samples (so a few matches say little). */
export const shrunk = (f: Fragility | undefined, k = 30) => (f ? (f.z * f.matches) / (f.matches + k) : 0);
