// The rest of the season, simulated (pure, unit tested; seeded so pages are stable). Every
// remaining event on the calendar: who enters (each player's habits, one event a week, the
// ranking cut), a seeded draw with byes, every match played from the ratings, ranking points
// awarded and last year's points dropped. Then the season finals (round robin, semis, final)
// for the top of the race. Out come each player's chances of qualifying, finishing No. 1 and
// ending in the top 10, plus the spread of their year-end points.

import { rng, seedSlots, shuffle } from "@/lib/lab/forecast";
import { pointsFor } from "@/lib/points";
import type { Tour } from "@/lib/provider/types";

export interface SimEvent {
  key: string;
  /** Monday of the event's week: players enter at most one event a week. */
  week: string;
  category: string;
  rounds: number;
  drawSize: number;
}

export interface SimPlayer {
  key: string;
  /** Ranking position now (seeding and the entry cut); unranked players sort last. */
  rank: number | null;
  /** Race points banked this season (events in progress: the part already guaranteed). */
  race: number;
  /** Ranking points now, after results since the last ranking and the points they replaced. */
  ranking: number;
  /** For each event in progress: possible final points (including the banked part) and chances. */
  live: { points: number; p: number }[][];
  /** The part of `race` and `ranking` already guaranteed in events in progress. */
  liveBanked: number;
  /** Points from last year that come off when this year's edition (by event key) is played; key "end": by year end. */
  drops: Record<string, number>;
  /** Chance of entering each remaining event (by key). */
  entry: Record<string, number>;
}

export interface SeasonInput {
  tour: Tour;
  players: SimPlayer[];
  events: SimEvent[];
  /** Win chance for a against b at an event; "field" stands for a qualifier-level entrant. */
  chance: (a: string, b: string, event: SimEvent) => number;
  finals: { spots: number; drop: Record<string, number> } | null;
  /**
   * Each simulated season, each player's level for the rest of it shifts by a random amount with
   * this standard deviation (rating points): injuries, slumps and hot streaks the ratings can't see yet.
   */
  formSd?: number;
  sims?: number;
  seed?: number;
}

export interface SeasonOutlook {
  key: string;
  finals: number;
  raceNo1: number;
  no1: number;
  top10: number;
  /** Year-end ranking points: 10th, 50th and 90th percentile. */
  ranking: [number, number, number];
  race: number;
}

export const FIELD = "field";
const BYE = "bye";
// Season finals: 200 a round-robin win, 400 for the semifinal, 500 for the final.
const RR_WIN = 200;
const SF_WIN = 400;
const F_WIN = 500;

/** Seeds by draw size, as on tour: a quarter of the draw, at most 32. */
export const seedsFor = (drawSize: number) => Math.min(32, Math.max(2, 2 ** Math.floor(Math.log2(drawSize / 4))));

/**
 * One draw: entrants in seeding order fill a 2^rounds bracket. Seeds go to their lines (groups
 * drawn among themselves), byes go to the top seeds, everyone else is drawn at random.
 */
export function drawLines(entrants: string[], rounds: number, rand: () => number): string[] {
  const size = 2 ** rounds;
  const byes = Math.max(0, size - entrants.length);
  const seeds = Math.min(entrants.length, Math.max(seedsFor(entrants.length), byes));
  const slots = seedSlots(size);
  const line = new Array<string>(size);
  const used = new Set<number>();
  // Seed groups drawn among themselves: 1, 2, 3–4, 5–8, 9–16, 17–32, 33–64.
  for (const [lo, top] of [[1, 1], [2, 2], [3, 4], [5, 8], [9, 16], [17, 32], [33, 64]]) {
    if (lo > seeds) break;
    const hi = Math.min(top, seeds);
    const lines = shuffle(
      slots.flatMap((s, i) => (s >= lo && s <= hi ? [i] : [])),
      rand,
    );
    entrants.slice(lo - 1, hi).forEach((p, k) => {
      line[lines[k]] = p;
      used.add(lines[k]);
    });
  }
  // Byes: the slot next to each of the top seeds.
  for (let s = 1; s <= byes; s++) {
    const i = slots.indexOf(s);
    const partner = i % 2 === 0 ? i + 1 : i - 1;
    line[partner] = BYE;
    used.add(partner);
  }
  const free = shuffle(
    slots.map((_, i) => i).filter((i) => !used.has(i)),
    rand,
  );
  entrants.slice(seeds).forEach((p, k) => (line[free[k]] = p));
  return line;
}

/** Plays a draw out: wins per entrant (a bye counts as a win) and who had one. */
export function playDraw(line: string[], p: (a: string, b: string) => number, rand: () => number): { wins: Map<string, number>; bye: Set<string> } {
  const wins = new Map<string, number>();
  const bye = new Set<string>();
  let round = line;
  while (round.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < round.length; i += 2) {
      const [a, b] = [round[i], round[i + 1]];
      let w: string;
      if (a === BYE || b === BYE) {
        w = a === BYE ? b : a;
        if (w !== BYE) bye.add(w);
      } else w = rand() < p(a, b) ? a : b;
      if (w !== BYE) wins.set(w, (wins.get(w) ?? 0) + 1);
      next.push(w);
    }
    round = next;
  }
  for (const k of line) if (k !== BYE && !wins.has(k)) wins.set(k, 0);
  return { wins, bye };
}

/** Season finals: two round-robin groups of four (1 and 2 apart), top two to the semis. Points per player. */
export function playFinals(qualified: string[], p: (a: string, b: string) => number, rand: () => number): Map<string, number> {
  const pts = new Map(qualified.map((k) => [k, 0]));
  if (qualified.length < 8) return pts;
  const rest = shuffle(qualified.slice(2, 8), rand);
  // 3–4 split, 5–8 split, as in the real draw (approximately).
  const groups = [[qualified[0], rest[0], rest[2], rest[4]], [qualified[1], rest[1], rest[3], rest[5]]];
  const semis: string[][] = [];
  for (const g of groups) {
    const w = new Map(g.map((k) => [k, 0]));
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++) {
        const winner = rand() < p(g[i], g[j]) ? g[i] : g[j];
        w.set(winner, w.get(winner)! + 1);
        pts.set(winner, pts.get(winner)! + RR_WIN);
      }
    semis.push(shuffle(g, rand).sort((a, b) => w.get(b)! - w.get(a)!).slice(0, 2));
  }
  const final: string[] = [];
  for (const [a, b] of [
    [semis[0][0], semis[1][1]],
    [semis[1][0], semis[0][1]],
  ]) {
    const winner = rand() < p(a, b) ? a : b;
    pts.set(winner, pts.get(winner)! + SF_WIN);
    final.push(winner);
  }
  const champ = rand() < p(final[0], final[1]) ? final[0] : final[1];
  pts.set(champ, pts.get(champ)! + F_WIN);
  return pts;
}

function sample(outcomes: { points: number; p: number }[], u: number): number {
  for (const o of outcomes) {
    if (u < o.p) return o.points;
    u -= o.p;
  }
  return outcomes.at(-1)?.points ?? 0;
}

const pct = (xs: number[], q: number) => xs[Math.min(xs.length - 1, Math.floor(q * xs.length))];

export function simulateSeason({ tour, players, events, chance, finals, formSd = 0, sims = 2000, seed = 7 }: SeasonInput): SeasonOutlook[] {
  const rand = rng(seed);
  const order = [...players].sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  const byKey = new Map(players.map((p) => [p.key, p]));
  const weeks = [...new Set(events.map((e) => e.week))].sort();
  const cache = new Map<string, number>();
  const form = new Map<string, number>();
  const pair = (e: SimEvent) => (a: string, b: string) => {
    const k = `${e.key}|${a}|${b}`;
    let v = cache.get(k);
    if (v === undefined) cache.set(k, (v = chance(a, b, e)));
    const shift = (form.get(a) ?? 0) - (form.get(b) ?? 0);
    if (shift === 0 || v <= 0 || v >= 1) return v;
    // Move the chance by the form gap on the rating scale (400 points = a factor of 10 in the odds).
    return 1 / (1 + ((1 - v) / v) * 10 ** (-shift / 400));
  };
  const normal = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
  const finalsEvent: SimEvent = { key: "finals", week: "9999", category: "Finals", rounds: 3, drawSize: 8 };

  const stats = new Map(players.map((p) => [p.key, { finals: 0, raceNo1: 0, no1: 0, top10: 0, race: 0, rankings: [] as number[] }]));
  const race = new Map<string, number>();
  const ranking = new Map<string, number>();

  for (let s = 0; s < sims; s++) {
    if (formSd > 0) for (const p of players) form.set(p.key, normal() * formSd);
    for (const p of players) {
      let live = 0;
      for (const o of p.live) live += sample(o, rand());
      race.set(p.key, p.race - p.liveBanked + live);
      ranking.set(p.key, p.ranking - p.liveBanked + live);
    }
    for (const week of weeks) {
      const evs = events.filter((e) => e.week === week);
      const entered = new Map(evs.map((e) => [e.key, [] as string[]]));
      for (const p of order) {
        for (const e of shuffle(evs, rand)) {
          if (rand() < (p.entry[e.key] ?? 0)) {
            entered.get(e.key)!.push(p.key);
            break;
          }
        }
      }
      for (const e of evs) {
        // The ranking cut: the best-ranked entrants, then qualifiers and wildcards ("field").
        const direct = entered.get(e.key)!.slice(0, e.drawSize);
        const lines = drawLines([...direct, ...Array.from({ length: e.drawSize - direct.length }, (_, i) => `${FIELD}#${i}`)], e.rounds, rand);
        const p = pair(e);
        const { wins, bye } = playDraw(lines, (a, b) => p(a.startsWith(FIELD) ? FIELD : a, b.startsWith(FIELD) ? FIELD : b), rand);
        for (const key of direct) {
          const pts = pointsFor(tour, e.category, e.rounds, wins.get(key) ?? 0, bye.has(key));
          race.set(key, race.get(key)! + pts);
          ranking.set(key, ranking.get(key)! + pts);
        }
      }
      // Last year's points from this week's events come off for everyone.
      for (const e of evs) for (const pl of players) if (pl.drops[e.key]) ranking.set(pl.key, ranking.get(pl.key)! - pl.drops[e.key]);
    }

    for (const pl of players) if (pl.drops.end) ranking.set(pl.key, ranking.get(pl.key)! - pl.drops.end);
    const byRace = [...players].sort((a, b) => race.get(b.key)! - race.get(a.key)! || (a.rank ?? 1e9) - (b.rank ?? 1e9));
    stats.get(byRace[0].key)!.raceNo1++;
    if (finals) {
      const q = byRace.slice(0, finals.spots).map((p) => p.key);
      for (const k of q) stats.get(k)!.finals++;
      for (const [k, pts] of playFinals(q, pair(finalsEvent), rand)) ranking.set(k, ranking.get(k)! + pts);
      for (const [k, d] of Object.entries(finals.drop)) if (byKey.has(k)) ranking.set(k, ranking.get(k)! - d);
    }
    const byRanking = [...players].sort((a, b) => ranking.get(b.key)! - ranking.get(a.key)!);
    stats.get(byRanking[0].key)!.no1++;
    byRanking.slice(0, 10).forEach((p) => stats.get(p.key)!.top10++);
    for (const p of players) {
      const st = stats.get(p.key)!;
      st.race += race.get(p.key)! / sims;
      st.rankings.push(ranking.get(p.key)!);
    }
  }

  return players.map((p) => {
    const st = stats.get(p.key)!;
    const r = st.rankings.sort((a, b) => a - b);
    return {
      key: p.key,
      finals: st.finals / sims,
      raceNo1: st.raceNo1 / sims,
      no1: st.no1 / sims,
      top10: st.top10 / sims,
      ranking: [pct(r, 0.1), pct(r, 0.5), pct(r, 0.9)],
      race: Math.round(st.race),
    };
  });
}
