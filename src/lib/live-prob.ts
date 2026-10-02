// In-match win chance from the live score (pure, unit tested). Each player wins a point on their
// own serve with a fixed chance; those are set so that, from 0-0, the match chance equals the
// model's pre-match chance. From there the score is exact: points, games, tiebreaks, sets.

export interface ServeModel {
  /** Chance A wins a point on A's serve, and B on B's serve. */
  a: number;
  b: number;
  bestOf: 3 | 5;
}

export interface LiveState {
  setsA: number;
  setsB: number;
  gamesA: number;
  gamesB: number;
  /** Points in the current game (or tiebreak): 0,1,2,3… (deuce handled for 3+). */
  pointsA: number;
  pointsB: number;
  /** Who serves the current game (or point, in a tiebreak). */
  serverA: boolean;
  tiebreak: boolean;
}

function memo<T>(fn: (key: string, ...args: number[]) => T) {
  const cache = new Map<string, T>();
  return (...args: number[]) => {
    const key = args.join(",");
    let v = cache.get(key);
    if (v === undefined) {
      v = fn(key, ...args);
      cache.set(key, v);
    }
    return v;
  };
}

/** Chance the server wins the game from a point score. */
export function holdFrom(s: number, a: number, b: number): number {
  if (a >= 4 && a - b >= 2) return 1;
  if (b >= 4 && b - a >= 2) return 0;
  if (a >= 3 && b >= 3) {
    const deuce = (s * s) / (s * s + (1 - s) * (1 - s));
    if (a === b) return deuce;
    return a > b ? s + (1 - s) * deuce : s * deuce;
  }
  return s * holdFrom(s, a + 1, b) + (1 - s) * holdFrom(s, a, b + 1);
}

export function matchModel(m: ServeModel) {
  const x = m.a; // A wins a point on A's serve
  const y = 1 - m.b; // A wins a point on B's serve

  // Tiebreak: first to 7 by 2. `firstA`: A served the tiebreak's first point.
  const tiebreak: (...args: number[]) => number = memo<number>((_k, a, b, firstA): number => {
    if (a >= 7 && a - b >= 2) return 1;
    if (b >= 7 && b - a >= 2) return 0;
    if (a >= 6 && b >= 6 && a === b) return (x * y) / (x * y + (1 - x) * (1 - y));
    const k = a + b;
    const serverIsFirst = k === 0 || Math.floor((k - 1) / 2) % 2 === 1;
    const aServes = serverIsFirst === (firstA === 1);
    const p = aServes ? x : y;
    return p * tiebreak(a + 1, b, firstA) + (1 - p) * tiebreak(a, b + 1, firstA);
  });

  // Set from a game score, A serving the next game or not.
  const set: (...args: number[]) => number = memo<number>((_k, ga, gb, aServes): number => {
    if (ga >= 6 && ga - gb >= 2) return 1;
    if (gb >= 6 && gb - ga >= 2) return 0;
    if (ga === 7 || gb === 7) return ga > gb ? 1 : 0;
    if (ga === 6 && gb === 6) return tiebreak(0, 0, aServes);
    const hold = aServes === 1 ? holdFrom(x, 0, 0) : 1 - holdFrom(m.b, 0, 0);
    return hold * set(ga + 1, gb, 1 - aServes) + (1 - hold) * set(ga, gb + 1, 1 - aServes);
  });

  const need = Math.ceil(m.bestOf / 2);
  // Match from a set score; who serves first in the next set alternates roughly evenly: average both.
  const match: (...args: number[]) => number = memo<number>((_k, sa, sb): number => {
    if (sa >= need) return 1;
    if (sb >= need) return 0;
    const s = (set(0, 0, 1) + set(0, 0, 0)) / 2;
    return s * match(sa + 1, sb) + (1 - s) * match(sa, sb + 1);
  });

  return { tiebreak, set, match, x, y };
}

/** A's chance to win the match from a live state. */
export function liveChance(m: ServeModel, st: LiveState): number {
  const { tiebreak, set, match, x } = matchModel(m);
  const afterSet = (wonA: number) => wonA * match(st.setsA + 1, st.setsB) + (1 - wonA) * match(st.setsA, st.setsB + 1);

  if (st.tiebreak) {
    // Approximate the tiebreak's first server from whoever serves now and the points played.
    const k = st.pointsA + st.pointsB;
    const serverIsFirst = k === 0 || Math.floor((k - 1) / 2) % 2 === 1;
    const firstA = serverIsFirst === st.serverA ? 1 : 0;
    return afterSet(tiebreak(st.pointsA, st.pointsB, firstA));
  }
  // Current game, then the rest of the set with the serve passing over.
  const holdA = st.serverA ? holdFrom(x, st.pointsA, st.pointsB) : 1 - holdFrom(m.b, st.pointsB, st.pointsA);
  const next = st.serverA ? 0 : 1;
  const winSet = holdA * set(st.gamesA + 1, st.gamesB, next) + (1 - holdA) * set(st.gamesA, st.gamesB + 1, next);
  return afterSet(winSet);
}

/** Serve strengths that reproduce a pre-match chance (tour-typical average serve-point rate). */
export function serveModelFor(preMatch: number, bestOf: 3 | 5, average: number): ServeModel {
  let lo = -0.4;
  let hi = 0.4;
  for (let i = 0; i < 40; i++) {
    const d = (lo + hi) / 2;
    const p = matchModel({ a: average + d / 2, b: average - d / 2, bestOf }).match(0, 0);
    if (p < preMatch) lo = d;
    else hi = d;
  }
  const d = (lo + hi) / 2;
  return { a: average + d / 2, b: average - d / 2, bestOf };
}

const POINTS: Record<string, number> = { "0": 0, "15": 1, "30": 2, "40": 3 };

/** Live state from a scoreboard: sets, game strings ("15", "40", "A"/"AD", or tiebreak numbers). */
export function stateFromScore(
  sets: { p1: number | null; p2: number | null }[],
  game1: string | null,
  game2: string | null,
  serverA: boolean | null,
): LiveState | null {
  if (serverA === null) return null;
  const played = sets.filter((s) => s.p1 !== null && s.p2 !== null) as { p1: number; p2: number }[];
  const done = (s: { p1: number; p2: number }) => (Math.max(s.p1, s.p2) >= 6 && Math.abs(s.p1 - s.p2) >= 2) || Math.max(s.p1, s.p2) === 7;
  const finished = played.filter(done);
  const current = played.find((s) => !done(s)) ?? { p1: 0, p2: 0 };
  const tiebreak = current.p1 === 6 && current.p2 === 6;
  const parse = (g: string | null, other: string | null): number | null => {
    if (g === null || g === "") return 0;
    const t = g.trim().toUpperCase();
    if (tiebreak) return /^\d+$/.test(t) ? Number(t) : null;
    if (t === "A" || t === "AD") return 4;
    if (t === "40" && (other ?? "").trim().toUpperCase().startsWith("A")) return 3;
    return POINTS[t] ?? null;
  };
  const pointsA = parse(game1, game2);
  const pointsB = parse(game2, game1);
  if (pointsA === null || pointsB === null) return null;
  // Advantage: model it as deuce plus one.
  const [pa, pb] = pointsA === 4 ? [4, 3] : pointsB === 4 ? [3, 4] : [pointsA, pointsB];
  return {
    setsA: finished.filter((s) => s.p1 > s.p2).length,
    setsB: finished.filter((s) => s.p2 > s.p1).length,
    gamesA: current.p1,
    gamesB: current.p2,
    pointsA: pa,
    pointsB: pb,
    serverA,
    tiebreak,
  };
}
