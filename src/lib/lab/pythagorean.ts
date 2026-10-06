// The deserved record (pure, unit tested): tennis's "Pythagorean" expectation (Kovalchik, JQAS
// 2016). A player-season's share of games won predicts its share of matches won through
// logit(wins) = k · logit(games); the gap between the real record and that is close-match luck.
// The test that matters: which predicts next season better, the record or the games?

export interface SeasonLine {
  key: string;
  season: number;
  wins: number;
  matches: number;
  gamesWon: number;
  gamesPlayed: number;
}

const logit = (p: number) => Math.log(p / (1 - p));
const clamp = (p: number) => Math.min(0.99, Math.max(0.01, p));

/** The exponent k, by least squares on the logit scale (player-seasons with `min` matches). */
export function fitExponent(lines: SeasonLine[], min = 20): number {
  let sxy = 0;
  let sxx = 0;
  for (const l of lines) {
    if (l.matches < min || l.gamesPlayed === 0) continue;
    const x = logit(clamp(l.gamesWon / l.gamesPlayed));
    const y = logit(clamp(l.wins / l.matches));
    sxy += x * y;
    sxx += x * x;
  }
  return sxx ? sxy / sxx : 0;
}

/** Expected match-win share from a game share. */
export const expectedWins = (gameShare: number, k: number) => 1 / (1 + Math.exp(-k * logit(clamp(gameShare))));

const correlation = (xs: number[], ys: number[]) => {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
};

/**
 * For players with `min` matches in consecutive seasons: how well this season's record and this
 * season's deserved record predict next season's record, and whether luck itself carries over.
 */
export function nextSeasonTest(lines: SeasonLine[], k: number, min = 20) {
  const by = new Map(lines.map((l) => [`${l.key}|${l.season}`, l]));
  const pairs = lines.flatMap((l) => {
    const next = by.get(`${l.key}|${l.season + 1}`);
    return l.matches >= min && next && next.matches >= min ? [[l, next] as const] : [];
  });
  const rate = (l: SeasonLine) => l.wins / l.matches;
  const deserved = (l: SeasonLine) => expectedWins(l.gamesWon / l.gamesPlayed, k);
  return {
    pairs: pairs.length,
    fromRecord: correlation(pairs.map(([a]) => rate(a)), pairs.map(([, b]) => rate(b))),
    fromGames: correlation(pairs.map(([a]) => deserved(a)), pairs.map(([, b]) => rate(b))),
    luckCarries: correlation(pairs.map(([a]) => rate(a) - deserved(a)), pairs.map(([, b]) => rate(b) - deserved(b))),
  };
}
