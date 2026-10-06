// The research engine (pure, unit tested): replays every result in order with the site's Elo
// model and, at the start of each tournament, rebuilds its draw and computes every entrant's exact
// title chance from the ratings of that week. Also keeps weekly rating snapshots for every player.

import { bestOfFive, calibrate, newRating, updateRatings, winProbability, type Rating, type Surface } from "@/lib/model/elo";

import { entrants, reconstruct, replaceLeaf, winChances } from "./bracket";

export interface LabMatch {
  id: number;
  tour: "atp" | "wta";
  tournamentId: number;
  startDate: string;
  /** Larger = later round. */
  round: number;
  key1: string;
  key2: string;
  winner: 1 | 2;
  surface: Surface | null;
  bestOf: 3 | 5;
  /** Walkovers shape the draw but don't move ratings. */
  walkover: boolean;
}

export interface TitleChanceRow {
  tournamentId: number;
  key: string;
  chance: number;
  champion: boolean;
  /** Entrant's overall rating going in (for context). */
  rating: number;
  /** Champions only: chance of beating the opponents they actually met (draw luck = path ÷ chance). */
  path?: number;
}

/** Expected titles `other` gained, summed over draws, when `player` is replaced by a typical entrant. */
export interface DeniedRow {
  tour: "atp" | "wta";
  player: string;
  other: string;
  gain: number;
}

/** Contenders whose absence is simulated: at least this pre-tournament title chance. */
const CONTENDER = 0.05;
const REPLACEMENT = "__replacement__";

export interface RatingWeekRow {
  key: string;
  tour: "atp" | "wta";
  week: string;
  overall: number;
  hard: number;
  clay: number;
  grass: number;
  matches: number;
}

const monday = (date: string) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};

export function runLab(
  matches: LabMatch[],
  calibration: Record<string, number>,
): { titles: TitleChanceRow[]; ratings: RatingWeekRow[]; denied: DeniedRow[]; drawsTried: number; drawsBuilt: number } {
  const titles: TitleChanceRow[] = [];
  const denied = new Map<string, DeniedRow>();
  const weeks = new Map<string, RatingWeekRow>();
  let drawsTried = 0;
  let drawsBuilt = 0;

  for (const tour of ["atp", "wta"] as const) {
    const ratings = new Map<string, Rating>();
    const get = (k: string) => {
      let r = ratings.get(k);
      if (!r) ratings.set(k, (r = newRating()));
      return r;
    };
    const c = calibration[tour] ?? 1;
    const byTournament = new Map<number, LabMatch[]>();
    for (const m of matches) if (m.tour === tour) byTournament.set(m.tournamentId, [...(byTournament.get(m.tournamentId) ?? []), m]);
    const ordered = [...byTournament.entries()].sort(([ia, a], [ib, b]) => a[0].startDate.localeCompare(b[0].startDate) || ia - ib);

    for (const [tournamentId, list] of ordered) {
      drawsTried++;
      const tree = reconstruct(list.map((m) => ({ key1: m.key1, key2: m.key2, winner: m.winner, round: m.round })));
      if (tree && "winner" in tree) {
        drawsBuilt++;
        const { surface, bestOf } = list[0];
        // A typical entrant of this draw: the median rating on every scale.
        const field = entrants(tree).map(get);
        const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
        const typical: Rating = {
          overall: median(field.map((r) => r.overall)),
          surface: { hard: median(field.map((r) => r.surface.hard)), clay: median(field.map((r) => r.surface.clay)), grass: median(field.map((r) => r.surface.grass)) },
          matches: 100,
          surfaceMatches: { hard: 100, clay: 100, grass: 100 },
        };
        const rating = (k: string) => (k === REPLACEMENT ? typical : get(k));
        const p = (a: string, b: string) => {
          const q = calibrate(winProbability(rating(a), rating(b), surface), c);
          return bestOf === 5 ? bestOfFive(q) : q;
        };
        const base = winChances(tree, p);
        // The champion's actual path: the product of their chances in the matches they played.
        const path = list
          .filter((m) => !m.walkover && (m.key1 === tree.winner || m.key2 === tree.winner))
          .reduce((acc, m) => acc * (m.key1 === tree.winner ? p(m.key1, m.key2) : p(m.key2, m.key1)), 1);
        for (const [key, chance] of base) {
          titles.push({ tournamentId, key, chance, champion: key === tree.winner, rating: Math.round(get(key).overall), ...(key === tree.winner ? { path } : {}) });
        }
        // What if each contender hadn't been there: who gains their share?
        for (const [player, chance] of base) {
          if (chance < CONTENDER) continue;
          const without = winChances(replaceLeaf(tree, player, REPLACEMENT), p);
          for (const [other, before] of base) {
            if (other === player) continue;
            const gain = (without.get(other) ?? 0) - before;
            if (gain <= 0.0005) continue;
            const k = `${player}|${other}`;
            const row = denied.get(k) ?? { tour, player, other, gain: 0 };
            row.gain += gain;
            denied.set(k, row);
          }
        }
      }
      // Then play the tournament: ratings move after each match, round by round.
      for (const m of [...list].sort((a, b) => a.round - b.round || a.id - b.id)) {
        if (m.walkover) continue;
        const a = get(m.key1);
        const b = get(m.key2);
        updateRatings(a, b, m.winner, m.surface);
        const week = monday(m.startDate);
        for (const [key, r] of [
          [m.key1, a],
          [m.key2, b],
        ] as const) {
          weeks.set(`${key}|${week}`, { key, tour, week, overall: r.overall, hard: r.surface.hard, clay: r.surface.clay, grass: r.surface.grass, matches: r.matches });
        }
      }
    }
  }
  return { titles, ratings: [...weeks.values()], denied: [...denied.values()].filter((d) => d.gain >= 0.02), drawsTried, drawsBuilt };
}
