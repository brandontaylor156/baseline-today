import "server-only";

import { cache } from "react";

import type { Tour } from "@/lib/provider/types";
import { TOURS } from "@/lib/provider/types";

import { getSeasonMatches } from "./season";
import { getRankingDates, getRankings, type RankingRow } from "./tennis";

export interface CountrySummary {
  code: string;
  name: string | null;
  players: Record<Tour, number>;
  best: Partial<Record<Tour, { id: number; name: string; rank: number }>>;
}

/** Current top-100 rankings of both tours. */
const currentRankings = cache(async (): Promise<Record<Tour, RankingRow[]>> => {
  const out = {} as Record<Tour, RankingRow[]>;
  for (const tour of TOURS) {
    const [latest] = await getRankingDates(tour);
    out[tour] = latest ? await getRankings(tour, latest) : [];
  }
  return out;
});

export const getCountries = cache(async (): Promise<CountrySummary[]> => {
  const rankings = await currentRankings();
  const by = new Map<string, CountrySummary>();
  for (const tour of TOURS) {
    for (const r of rankings[tour]) {
      const code = r.player.countryCode;
      if (!code) continue;
      const c = by.get(code) ?? { code, name: null, players: { atp: 0, wta: 0 }, best: {} };
      c.players[tour]++;
      if (!c.best[tour] || r.rank < c.best[tour]!.rank) c.best[tour] = { id: r.player.id, name: r.player.fullName, rank: r.rank };
      by.set(code, c);
    }
  }
  return [...by.values()].sort((a, b) => b.players.atp + b.players.wta - (a.players.atp + a.players.wta) || a.code.localeCompare(b.code));
});

export interface CountryDetail {
  code: string;
  ranked: Record<Tour, RankingRow[]>;
  season: Record<Tour, { w: number; l: number; titles: number }>;
  recent: { id: number; tour: Tour; winner: string; loser: string; winnerId: number | null; loserId: number | null; tournamentId: number; tournament: string; round: string | null; won: boolean }[];
}

export const getCountry = cache(async (code: string, seasonYear: number): Promise<CountryDetail> => {
  const rankings = await currentRankings();
  const ranked = { atp: rankings.atp.filter((r) => r.player.countryCode === code), wta: rankings.wta.filter((r) => r.player.countryCode === code) };
  const season = { atp: { w: 0, l: 0, titles: 0 }, wta: { w: 0, l: 0, titles: 0 } };
  const recent: CountryDetail["recent"] = [];

  for (const tour of TOURS) {
    const matches = await getSeasonMatches(tour, seasonYear);
    for (const m of [...matches].sort((a, b) => b.date.localeCompare(a.date) || b.roundRank - a.roundRank)) {
      if (m.walkover) continue;
      const sides = [m.p1, m.p2];
      for (const [i, p] of sides.entries()) {
        if (p.country !== code) continue;
        const won = m.winner === i + 1;
        if (won) season[tour].w++;
        else season[tour].l++;
        if (won && /^final(s)?$/i.test(m.round ?? "")) season[tour].titles++;
        if (recent.length < 12) {
          const winner = m.winner === 1 ? m.p1 : m.p2;
          const loser = m.winner === 1 ? m.p2 : m.p1;
          recent.push({ id: m.id, tour, winner: winner.name, loser: loser.name, winnerId: winner.id, loserId: loser.id, tournamentId: m.tournamentId, tournament: m.tournamentName, round: m.round, won });
        }
      }
    }
  }
  return { code, ranked, season, recent };
});
