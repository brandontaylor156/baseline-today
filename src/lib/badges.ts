// Pick'em streaks and badges from a player's settled picks (pure, unit tested).

export interface SettledPick {
  side: 1 | 2;
  winner: 1 | 2;
  /** Model's pre-match chance for player 1 (null until the daily model run). */
  p1: number | null;
  settledAt: string;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
}

export interface PickStats {
  correct: number;
  settled: number;
  currentStreak: number;
  bestStreak: number;
  badges: Badge[];
}

const BADGES: (Badge & { earned: (s: Omit<PickStats, "badges">, picks: SettledPick[]) => boolean })[] = [
  { id: "first", name: "On the board", description: "First correct pick", earned: (s) => s.correct >= 1 },
  { id: "ten", name: "Double digits", description: "10 correct picks", earned: (s) => s.correct >= 10 },
  { id: "fifty", name: "Half century", description: "50 correct picks", earned: (s) => s.correct >= 50 },
  { id: "streak5", name: "Hot streak", description: "5 correct in a row", earned: (s) => s.bestStreak >= 5 },
  { id: "streak10", name: "On fire", description: "10 correct in a row", earned: (s) => s.bestStreak >= 10 },
  { id: "upset", name: "Upset caller", description: "Right about a player the model gave 25% or less", earned: (_, p) => p.some((x) => right(x) && chanceOfPick(x) !== null && chanceOfPick(x)! <= 0.25) },
  { id: "slayer", name: "Giant slayer", description: "Right about a player the model gave 15% or less", earned: (_, p) => p.some((x) => right(x) && chanceOfPick(x) !== null && chanceOfPick(x)! <= 0.15) },
  { id: "perfect", name: "Perfect day", description: "5 or more picks settled in a day, all correct", earned: (_, p) => perfectDay(p) },
  { id: "model", name: "Beat the model", description: "More right than the model on the same 20+ matches", earned: (_, p) => beatsModel(p) },
];

const right = (p: SettledPick) => p.side === p.winner;
const chanceOfPick = (p: SettledPick) => (p.p1 === null ? null : p.side === 1 ? p.p1 : 1 - p.p1);

function perfectDay(picks: SettledPick[]): boolean {
  const days = new Map<string, { n: number; ok: boolean }>();
  for (const p of picks) {
    const d = p.settledAt.slice(0, 10);
    const cur = days.get(d) ?? { n: 0, ok: true };
    days.set(d, { n: cur.n + 1, ok: cur.ok && right(p) });
  }
  return [...days.values()].some((d) => d.n >= 5 && d.ok);
}

function beatsModel(picks: SettledPick[]): boolean {
  const scored = picks.filter((p) => p.p1 !== null);
  if (scored.length < 20) return false;
  const mine = scored.filter(right).length;
  const model = scored.filter((p) => (p.p1! >= 0.5 ? 1 : 2) === p.winner).length;
  return mine > model;
}

export function pickStats(picks: SettledPick[]): PickStats {
  const ordered = [...picks].sort((a, b) => a.settledAt.localeCompare(b.settledAt));
  let run = 0;
  let best = 0;
  for (const p of ordered) {
    run = right(p) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  const base = { correct: ordered.filter(right).length, settled: ordered.length, currentStreak: run, bestStreak: best };
  return { ...base, badges: BADGES.filter((b) => b.earned(base, ordered)).map(({ id, name, description }) => ({ id, name, description })) };
}
