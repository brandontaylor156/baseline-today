// The research engine (pure, unit tested): replays every result in order with the site's Elo
// model and, at the start of each tournament, rebuilds its draw and computes every entrant's exact
// title chance from the ratings of that week. Also keeps weekly rating snapshots for every player.

import { bestOfFive, calibrate, newRating, updateRatings, winProbability, type Rating, type Surface } from "@/lib/model/elo";

import { reconstruct, winChances } from "./bracket";

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
}

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

export function runLab(matches: LabMatch[], calibration: Record<string, number>): { titles: TitleChanceRow[]; ratings: RatingWeekRow[]; drawsTried: number; drawsBuilt: number } {
  const titles: TitleChanceRow[] = [];
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
        const p = (a: string, b: string) => {
          const q = calibrate(winProbability(get(a), get(b), surface), c);
          return bestOf === 5 ? bestOfFive(q) : q;
        };
        for (const [key, chance] of winChances(tree, p)) {
          titles.push({ tournamentId, key, chance, champion: key === tree.winner, rating: Math.round(get(key).overall) });
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
  return { titles, ratings: [...weeks.values()], drawsTried, drawsBuilt };
}
