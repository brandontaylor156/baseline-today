import "server-only";

import { cache } from "react";

import { upsets, type SeasonMatch } from "@/lib/leaders";
import { TOURS, type Tour } from "@/lib/provider/types";
import { finishedWeeks, weekRange } from "@/lib/weeks";

import { getSeasonMatches } from "./season";
import { getRankingDates, getRankings, type RankingRow } from "./tennis";
import { getSeasonTournaments, type TournamentSummary } from "./tournaments";

export interface WeekChampion {
  tournament: TournamentSummary;
  final: SeasonMatch | null;
}

export interface WeekRecap {
  monday: string;
  champions: WeekChampion[];
  upsets: ReturnType<typeof upsets>;
  model: { correct: number; total: number };
  matches: number;
  /** Rankings published after the week, with the biggest moves inside the top 100. */
  movers: { tour: Tour; date: string; up: RankingRow[]; down: RankingRow[] }[];
}

const CATEGORY_ORDER = ["Grand Slam", "ATP 1000", "WTA 1000", "ATP 500", "WTA 500", "ATP 250", "WTA 250", "WTA 125", "ATP Challenger"];
const weight = (c: string | null) => {
  const i = CATEGORY_ORDER.findIndex((x) => c?.includes(x));
  return i === -1 ? CATEGORY_ORDER.length : i;
};

/** Weeks of a season with a finished tournament, newest first (complete weeks only). */
export const getRecapWeeks = cache(async (season: number, today = new Date().toISOString().slice(0, 10)): Promise<string[]> => {
  const tournaments = await getSeasonTournaments(season);
  return finishedWeeks(
    tournaments.map((t) => t.endDate),
    today,
  ).filter((w) => w.startsWith(String(season)) || weekRange(w).end.startsWith(String(season)));
});

/** Everything that happened at the tournaments that finished in one week. */
export const getWeekRecap = cache(async (monday: string): Promise<WeekRecap | null> => {
  const { start, end } = weekRange(monday);
  const season = Number(end.slice(0, 4));
  const tournaments = (await getSeasonTournaments(season)).filter((t) => t.endDate && t.endDate >= start && t.endDate <= end);
  if (tournaments.length === 0) return null;

  const ids = new Set(tournaments.map((t) => t.id));
  const [seasonMatches, movers] = await Promise.all([
    Promise.all(TOURS.map((t) => getSeasonMatches(t, season))).then((all) => all.flat().filter((m) => ids.has(m.tournamentId))),
    Promise.all(
      TOURS.map(async (tour) => {
        // The first rankings published after the week ended.
        const dates = await getRankingDates(tour);
        const latest = new Date(Date.parse(`${end}T00:00:00Z`) + 8 * 86_400_000).toISOString().slice(0, 10);
        const date = [...dates].sort().find((d) => d > end && d <= latest);
        if (!date) return null;
        const rows = (await getRankings(tour, date)).filter((r) => r.rank <= 100 && r.movement);
        return {
          tour,
          date,
          up: [...rows].filter((r) => r.movement! > 0).sort((a, b) => b.movement! - a.movement!).slice(0, 5),
          down: [...rows].filter((r) => r.movement! < 0).sort((a, b) => a.movement! - b.movement!).slice(0, 5),
        };
      }),
    ),
  ]);

  const played = seasonMatches.filter((m) => !m.walkover);
  const predicted = played.filter((m) => m.preMatchP1 !== null);
  const champions = [...tournaments]
    .sort((a, b) => weight(a.category) - weight(b.category) || a.name.localeCompare(b.name))
    .map((t) => ({ tournament: t, final: seasonMatches.find((m) => m.tournamentId === t.id && /^finals?$/i.test(m.round ?? "")) ?? null }));

  return {
    monday,
    champions,
    upsets: upsets(played, 0.35, 8),
    model: { correct: predicted.filter((m) => (m.preMatchP1! >= 0.5) === (m.winner === 1)).length, total: predicted.length },
    matches: played.length,
    movers: movers.filter((m): m is NonNullable<typeof m> => m !== null),
  };
});
