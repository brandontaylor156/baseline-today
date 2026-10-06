// Exact scoreline probabilities (pure, unit tested). From the serve model that reproduces the
// pre-match chance: the distribution of each set's score (6-0 … 7-6), the match score in sets,
// the chance of at least one tiebreak and the total games, by exact forward recursion.

import { holdFrom, matchModel, serveModelFor, type ServeModel } from "@/lib/live-prob";

export interface SetOutcome {
  a: number;
  b: number;
  p: number;
}

/** Final scores of one set with A serving the first game (1) or B (0). */
export function setScores(m: ServeModel, aServesFirst: 0 | 1): SetOutcome[] {
  const { tiebreak } = matchModel(m);
  const holdA = holdFrom(m.a, 0, 0);
  const holdB = holdFrom(m.b, 0, 0);
  // Probability mass at each game score; the server alternates every game.
  let frontier = new Map<string, number>([["0,0", 1]]);
  const done: SetOutcome[] = [];
  while (frontier.size > 0) {
    const next = new Map<string, number>();
    for (const [key, p] of frontier) {
      const [ga, gb] = key.split(",").map(Number);
      if (ga === 6 && gb === 6) {
        // Tiebreak: the player due to serve game 13 serves first.
        const firstA = (aServesFirst === 1) === ((ga + gb) % 2 === 0) ? 1 : 0;
        const t = tiebreak(0, 0, firstA);
        done.push({ a: 7, b: 6, p: p * t }, { a: 6, b: 7, p: p * (1 - t) });
        continue;
      }
      const aServes = (aServesFirst === 1) === ((ga + gb) % 2 === 0);
      const winA = aServes ? holdA : 1 - holdB;
      for (const [na, nb, q] of [
        [ga + 1, gb, winA],
        [ga, gb + 1, 1 - winA],
      ] as const) {
        const over = (na >= 6 && na - nb >= 2) || (nb >= 6 && nb - na >= 2) || na === 7 || nb === 7;
        if (over) done.push({ a: na, b: nb, p: p * q });
        else next.set(`${na},${nb}`, (next.get(`${na},${nb}`) ?? 0) + p * q);
      }
    }
    frontier = next;
  }
  // Merge identical scores.
  const merged = new Map<string, SetOutcome>();
  for (const o of done) {
    const k = `${o.a}-${o.b}`;
    const e = merged.get(k);
    if (e) e.p += o.p;
    else merged.set(k, { ...o });
  }
  return [...merged.values()].sort((x, y) => y.p - x.p);
}

export interface Scorelines {
  /** Match score in sets from A's side ("2-0", "1-2"…), most likely first. */
  sets: { a: number; b: number; p: number }[];
  /** A single set's score distribution (averaged over who serves first). */
  setScores: SetOutcome[];
  tiebreak: number;
  /** Distribution of total games in the match, and its mean. */
  games: Map<number, number>;
  meanGames: number;
}

/** Match-level scorelines. Who serves first alternates set to set; each set averages both orders. */
export function scorelines(m: ServeModel): Scorelines {
  const s1 = setScores(m, 1);
  const s0 = setScores(m, 0);
  const one = new Map<string, SetOutcome>();
  for (const o of [...s1, ...s0]) {
    const k = `${o.a}-${o.b}`;
    const e = one.get(k);
    if (e) e.p += o.p / 2;
    else one.set(k, { ...o, p: o.p / 2 });
  }
  const per = [...one.values()];
  const need = Math.ceil(m.bestOf / 2);
  // State: sets won by each, total games so far, any tiebreak yet → probability.
  type State = { sa: number; sb: number; games: number; tb: number; p: number };
  let states: State[] = [{ sa: 0, sb: 0, games: 0, tb: 0, p: 1 }];
  const finals: State[] = [];
  while (states.length > 0) {
    const next = new Map<string, State>();
    for (const st of states) {
      for (const o of per) {
        const sa = st.sa + (o.a > o.b ? 1 : 0);
        const sb = st.sb + (o.b > o.a ? 1 : 0);
        const ns: State = { sa, sb, games: st.games + o.a + o.b, tb: st.tb || (o.a + o.b === 13 ? 1 : 0), p: st.p * o.p };
        if (sa === need || sb === need) finals.push(ns);
        else {
          const k = `${sa},${sb},${ns.games},${ns.tb}`;
          const e = next.get(k);
          if (e) e.p += ns.p;
          else next.set(k, ns);
        }
      }
    }
    states = [...next.values()];
  }
  const sets = new Map<string, { a: number; b: number; p: number }>();
  const games = new Map<number, number>();
  let tiebreak = 0;
  let meanGames = 0;
  for (const f of finals) {
    const k = `${f.sa}-${f.sb}`;
    const e = sets.get(k);
    if (e) e.p += f.p;
    else sets.set(k, { a: f.sa, b: f.sb, p: f.p });
    games.set(f.games, (games.get(f.games) ?? 0) + f.p);
    tiebreak += f.tb * f.p;
    meanGames += f.games * f.p;
  }
  return { sets: [...sets.values()].sort((x, y) => y.p - x.p), setScores: per.sort((x, y) => y.p - x.p), tiebreak, games, meanGames };
}

// Gauss–Hermite nodes and weights (probabilists', 7 points) for averaging over a normal spread.
const GH: [number, number][] = [
  [-3.7504397, 0.000548268858],
  [-2.3667594, 0.0307571239],
  [-1.1544054, 0.240123178],
  [0, 0.457142857],
  [1.1544054, 0.240123178],
  [2.3667594, 0.0307571239],
  [3.7504397, 0.000548268858],
];

const logistic = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * Match-day form: the edge between the two players varies from day to day (normal spread `tau` on
 * the log-odds scale), centred so the average match chance is still `pre`. Returns the chance on
 * each node and its weight; scorelines are then averaged over them, which gives more lopsided
 * results than independent sets alone.
 */
export function formNodes(pre: number, tau: number): { p: number; w: number }[] {
  if (tau <= 0) return [{ p: pre, w: 1 }];
  const mean = (c: number) => GH.reduce((s, [z, w]) => s + w * logistic(c + tau * z), 0);
  let lo = -12;
  let hi = 12;
  for (let i = 0; i < 60; i++) {
    const c = (lo + hi) / 2;
    if (mean(c) < pre) lo = c;
    else hi = c;
  }
  const c = (lo + hi) / 2;
  return GH.map(([z, w]) => ({ p: logistic(c + tau * z), w }));
}

/** Averages scorelines over the form nodes (each from its own serve model). */
export function mixScorelines(parts: { s: Scorelines; w: number }[]): Scorelines {
  const sets = new Map<string, { a: number; b: number; p: number }>();
  const one = new Map<string, SetOutcome>();
  const games = new Map<number, number>();
  let tiebreak = 0;
  let meanGames = 0;
  for (const { s, w } of parts) {
    for (const o of s.sets) {
      const k = `${o.a}-${o.b}`;
      const e = sets.get(k);
      if (e) e.p += w * o.p;
      else sets.set(k, { ...o, p: w * o.p });
    }
    for (const o of s.setScores) {
      const k = `${o.a}-${o.b}`;
      const e = one.get(k);
      if (e) e.p += w * o.p;
      else one.set(k, { ...o, p: w * o.p });
    }
    for (const [g, p] of s.games) games.set(g, (games.get(g) ?? 0) + w * p);
    tiebreak += w * s.tiebreak;
    meanGames += w * s.meanGames;
  }
  return { sets: [...sets.values()].sort((x, y) => y.p - x.p), setScores: [...one.values()].sort((x, y) => y.p - x.p), tiebreak, games, meanGames };
}

/** Tuned on every completed match since 2016 (the scorelines job re-checks them weekly). */
export const SCORELINE_PARAMS: Record<"atp" | "wta", { average: number; tau: number }> = {
  atp: { average: 0.64, tau: 2 },
  wta: { average: 0.56, tau: 2.5 },
};

/** Scorelines for a match from its pre-match chance, with match-day form. */
export function matchScorelines(pre: number, bestOf: 3 | 5, params: { average: number; tau: number }): Scorelines {
  const p = Math.min(0.995, Math.max(0.005, pre));
  return mixScorelines(formNodes(p, params.tau).map((n) => ({ s: scorelines(serveModelFor(Math.min(0.995, Math.max(0.005, n.p)), bestOf, params.average)), w: n.w })));
}

/** The range of total games holding the middle `share` of the distribution. */
export function gamesRange(games: Map<number, number>, share = 0.8): [number, number] {
  const sorted = [...games].sort((a, b) => a[0] - b[0]);
  const lo = (1 - share) / 2;
  let acc = 0;
  let from = sorted[0]?.[0] ?? 0;
  let to = sorted.at(-1)?.[0] ?? 0;
  let foundFrom = false;
  for (const [g, p] of sorted) {
    acc += p;
    if (!foundFrom && acc >= lo) {
      from = g;
      foundFrom = true;
    }
    if (acc >= 1 - lo) {
      to = g;
      break;
    }
  }
  return [from, to];
}
