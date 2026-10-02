// The model's recent record from pre-match probabilities (pure, unit tested).

export interface ScoredMatch {
  id: number;
  tournament: string;
  round: string | null;
  p1: { id: number | null; name: string; rank: number | null };
  p2: { id: number | null; name: string; rank: number | null };
  winner: 1 | 2;
  /** Calibrated model probability that player 1 wins, before the match. */
  p1Chance: number;
}

export interface Call {
  match: ScoredMatch;
  /** The model's pick and its chance. */
  pick: 1 | 2;
  chance: number;
}

export interface TrackRecord {
  correct: number;
  total: number;
  /** Right, and the model's pick was ranked lower than the opponent (or unranked vs ranked). */
  beatRanking: Call[];
  /** Wrong, most confident first. */
  misses: Call[];
}

const rankOrInf = (r: number | null) => r ?? Infinity;

export function trackRecord(matches: ScoredMatch[], limit = 5): TrackRecord {
  const calls: Call[] = matches.map((m) => {
    const pick: 1 | 2 = m.p1Chance >= 0.5 ? 1 : 2;
    return { match: m, pick, chance: pick === 1 ? m.p1Chance : 1 - m.p1Chance };
  });
  const right = calls.filter((c) => c.pick === c.match.winner);
  const rankGap = (c: Call) => {
    const mine = rankOrInf(c.pick === 1 ? c.match.p1.rank : c.match.p2.rank);
    const theirs = rankOrInf(c.pick === 1 ? c.match.p2.rank : c.match.p1.rank);
    return mine === Infinity && theirs === Infinity ? 0 : mine - theirs;
  };
  return {
    correct: right.length,
    total: calls.length,
    beatRanking: right
      .filter((c) => rankGap(c) > 0)
      .sort((a, b) => Math.min(rankGap(b), 500) - Math.min(rankGap(a), 500) || b.chance - a.chance)
      .slice(0, limit),
    misses: calls
      .filter((c) => c.pick !== c.match.winner)
      .sort((a, b) => b.chance - a.chance)
      .slice(0, limit),
  };
}
