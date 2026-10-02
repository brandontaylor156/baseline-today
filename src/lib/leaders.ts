// Season leaderboards and upsets (pure, unit tested).

import { playerStats, type StatMatch } from "./stats";

export interface SeasonMatch extends StatMatch {
  tour: "atp" | "wta";
  tournamentId: number;
  tournamentName: string;
  p1: { key: string; id: number | null; name: string; country: string | null };
  p2: { key: string; id: number | null; name: string; country: string | null };
  /** Calibrated model probability that player 1 wins, before the match. */
  preMatchP1: number | null;
}

export interface LeaderRow {
  key: string;
  id: number | null;
  name: string;
  country: string | null;
  w: number;
  l: number;
  pct: number;
  titles: number;
  comebacks: number;
  tiebreaksWon: number;
}

/** Aggregates a season per player (walkovers excluded by playerStats). */
export function leaderRows(matches: SeasonMatch[]): LeaderRow[] {
  const byPlayer = new Map<string, { info: SeasonMatch["p1"]; matches: StatMatch[] }>();
  for (const m of matches) {
    for (const side of [1, 2] as const) {
      const info = side === 1 ? m.p1 : m.p2;
      const entry = byPlayer.get(info.key) ?? { info, matches: [] };
      entry.matches.push({ ...m, side });
      byPlayer.set(info.key, entry);
    }
  }
  return [...byPlayer.values()].map(({ info, matches: ms }) => {
    const s = playerStats(ms);
    const n = s.overall.w + s.overall.l;
    return {
      key: info.key,
      id: info.id,
      name: info.name,
      country: info.country,
      w: s.overall.w,
      l: s.overall.l,
      pct: n ? s.overall.w / n : 0,
      titles: s.titles,
      comebacks: s.comebacks,
      tiebreaksWon: s.tiebreaks.w,
    };
  });
}

export type LeaderMetric = "wins" | "pct" | "titles" | "comebacks" | "tiebreaksWon";

export function topBy(rows: LeaderRow[], metric: LeaderMetric, limit = 10, minMatches = 15): LeaderRow[] {
  const value = (r: LeaderRow) => (metric === "wins" ? r.w : metric === "pct" ? r.pct : r[metric]);
  return rows
    .filter((r) => (metric === "pct" ? r.w + r.l >= minMatches : value(r) > 0))
    .sort((a, b) => value(b) - value(a) || b.w - a.w || a.name.localeCompare(b.name))
    .slice(0, limit);
}

export interface Upset {
  match: SeasonMatch;
  winnerChance: number;
}

/** Wins the model gave the winner the least chance of, before the match. Walkovers excluded. */
export function upsets(matches: SeasonMatch[], maxChance = 0.35, limit = 20): Upset[] {
  return matches
    .filter((m) => m.preMatchP1 !== null && !m.walkover)
    .map((m) => ({ match: m, winnerChance: m.winner === 1 ? m.preMatchP1! : 1 - m.preMatchP1! }))
    .filter((u) => u.winnerChance <= maxChance)
    .sort((a, b) => a.winnerChance - b.winnerChance || b.match.date.localeCompare(a.match.date))
    .slice(0, limit);
}
