// The draw-day report (pure, unit tested): from a draw as made, before a ball is struck. Each
// quarter's favourite, how open it is and how many contenders it holds (the "quarter of death"), every seed's draw luck (their chances here
// against the average over many random draws made with the real seeding rules), the likeliest
// matchups and the best-placed unseeded players.

import { drawChances, winChance, type DrawModel, type DrawPlayer } from "@/lib/draw-model";
import { lineBracket, reachChances } from "@/lib/lab/bracket";
import { rng } from "@/lib/lab/forecast";
import { drawLines } from "@/lib/season-sim";

export interface ReportPlayer {
  key: string;
  id: number | null;
  name: string;
  countryCode: string | null;
  seed: string | null;
  /** Chance of winning at least r matches, r = 0…rounds, in this draw. */
  reach: number[];
}

export interface Quarter {
  index: number;
  seeds: ReportPlayer[];
  favourite: ReportPlayer;
  /** The favourite's chance to win the quarter (reach the semifinals). */
  favouriteChance: number;
  /** Sum of the quarter's title chances, and the part held by players other than the favourite. */
  titleShare: number;
  rivalShare: number;
}

export interface Luck {
  player: ReportPlayer;
  /** Title and semifinal chances: in this draw, and on average over random draws. */
  title: number;
  titleAverage: number;
  semi: number;
  semiAverage: number;
}

export interface Matchup {
  a: ReportPlayer;
  b: ReportPlayer;
  round: number;
  p: number;
}

export interface DrawReport {
  rounds: number;
  players: ReportPlayer[];
  quarters: Quarter[];
  luck: Luck[];
  quarterfinals: Matchup[];
  finals: Matchup[];
  darkHorses: ReportPlayer[];
  draws: number;
}

const seedNumber = (s: string | null) => {
  const n = Number(s?.match(/\d+/)?.[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Average reach across random draws with the real seeding rules (seeds in their lines, byes to the top seeds). */
export function randomDrawReach(model: DrawModel, draws = 300, seed = 3): Map<string, number[]> {
  const rand = rng(seed);
  const p = winChance(model);
  const order = [...model.players].sort((a, b) => (seedNumber(a.seed) ?? 1e6) - (seedNumber(b.seed) ?? 1e6) || (b.rating?.overall ?? 0) - (a.rating?.overall ?? 0));
  const keys = order.map((x) => x.key);
  const total = new Map<string, number[]>();
  const pp = (a: string, b: string) => (a === "bye" ? 0 : b === "bye" ? 1 : p(a, b));
  for (let d = 0; d < draws; d++) {
    const tree = lineBracket(drawLines(keys, model.rounds, rand));
    if (!tree) break;
    for (const [k, arr] of reachChances(tree, pp)) {
      if (k === "bye") continue;
      const t = total.get(k) ?? new Array(arr.length).fill(0);
      arr.forEach((x, i) => (t[i] += x / draws));
      total.set(k, t);
    }
  }
  return total;
}

export function drawReport(model: DrawModel, draws = 300): DrawReport {
  const pre: DrawModel = { ...model, played: [] };
  const reach = drawChances(pre);
  const R = model.rounds;
  const asReport = (p: DrawPlayer): ReportPlayer => ({ key: p.key, id: p.id, name: p.name, countryCode: p.countryCode, seed: p.seed, reach: reach.get(p.key) ?? new Array(R + 1).fill(0) });
  const players = model.players.map(asReport).sort((a, b) => (b.reach[R] ?? 0) - (a.reach[R] ?? 0));
  const byKey = new Map(players.map((p) => [p.key, p]));
  const pos = new Map(model.players.map((p) => [p.key, p.position]));
  const block = (key: string, size: number) => Math.floor(pos.get(key)! / size);

  // Quarters: four equal blocks of the bracket; winning one = reaching the semifinals (R − 2 wins).
  const qSize = model.size / 4;
  const quarters: Quarter[] = [0, 1, 2, 3].map((index) => {
    const mine = players.filter((p) => block(p.key, qSize) === index);
    const favourite = [...mine].sort((a, b) => (b.reach[R - 2] ?? 0) - (a.reach[R - 2] ?? 0))[0];
    return {
      index,
      seeds: mine.filter((p) => seedNumber(p.seed) !== null).sort((a, b) => seedNumber(a.seed)! - seedNumber(b.seed)!),
      favourite,
      favouriteChance: favourite?.reach[R - 2] ?? 0,
      titleShare: mine.reduce((s, p) => s + (p.reach[R] ?? 0), 0),
      rivalShare: mine.reduce((s, p) => s + (p.key === favourite?.key ? 0 : (p.reach[R] ?? 0)), 0),
    };
  });

  const average = randomDrawReach(model, draws);
  const luck = players
    .filter((p) => seedNumber(p.seed) !== null)
    .map((p) => ({
      player: p,
      title: p.reach[R] ?? 0,
      titleAverage: average.get(p.key)?.[R] ?? 0,
      semi: p.reach[R - 2] ?? 0,
      semiAverage: average.get(p.key)?.[R - 2] ?? 0,
    }))
    .sort((a, b) => seedNumber(a.player.seed)! - seedNumber(b.player.seed)!);

  // Two players meet in round r when they sit in the two halves of the same block of 2^r lines,
  // with chance reach_a[r−1] × reach_b[r−1].
  const meetings = (round: number): Matchup[] => {
    const size = 2 ** round;
    const out: Matchup[] = [];
    for (const a of players)
      for (const b of players) {
        if (a.key >= b.key) continue;
        if (block(a.key, size) !== block(b.key, size) || block(a.key, size / 2) === block(b.key, size / 2)) continue;
        const p = (a.reach[round - 1] ?? 0) * (b.reach[round - 1] ?? 0);
        if (p > 0.005) out.push({ a, b, round, p });
      }
    return out.sort((x, y) => y.p - x.p);
  };

  return {
    rounds: R,
    players,
    quarters,
    luck,
    quarterfinals: R >= 3 ? meetings(R - 2).slice(0, 6) : [],
    finals: meetings(R).slice(0, 4),
    darkHorses: players.filter((p) => seedNumber(p.seed) === null && byKey.has(p.key)).sort((a, b) => (b.reach[R - 2] ?? 0) - (a.reach[R - 2] ?? 0)).slice(0, 5),
    draws,
  };
}
