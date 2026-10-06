import "server-only";

import { cache } from "react";

import { normalizeSurface } from "@/lib/model/elo";
import { createPublicClient } from "@/lib/supabase/public";

import { getRankingDates, getRankings } from "./tennis";

type Row = {
  id: number;
  season: number | null;
  round: string | null;
  winner_side: number;
  result_detail: string | null;
  player1_id: number | null;
  player2_id: number | null;
  player1_name: string | null;
  player2_name: string | null;
  player1_country: string | null;
  player2_country: string | null;
  p1: { full_name: string; country_code: string | null } | null;
  p2: { full_name: string; country_code: string | null } | null;
  tournaments: { id: number; name: string; start_date: string | null; surface: string | null; tour: string };
};

export interface Rival {
  key: string;
  id: number | null;
  name: string;
  country: string | null;
  /** This week's rank (top 100 only). */
  rank: number | null;
  wins: number;
  losses: number;
  surfaces: { hard: [number, number]; clay: [number, number]; grass: [number, number] };
  last: { matchId: number; won: boolean; season: number | null; tournament: string; round: string | null };
}

export interface Rivals {
  tour: string;
  rivals: Rival[];
  vsTop10: [number, number];
  vsTop100: [number, number];
  matches: number;
}

/** A player's record against everyone they've met in the tracked draws since 2015 (walkovers excluded). */
export const getRivals = cache(async (playerId: number): Promise<Rivals | null> => {
  const db = createPublicClient();
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("matches")
      .select(
        "id, season, round, winner_side, result_detail, player1_id, player2_id, player1_name, player2_name, player1_country, player2_country, p1:players!matches_player1_id_fkey(full_name, country_code), p2:players!matches_player2_id_fkey(full_name, country_code), tournaments!inner(id, name, start_date, surface, tour)",
      )
      .eq("status", "final")
      .eq("confirmed", true)
      .in("winner_side", [1, 2])
      .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`rivals: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }
  if (rows.length === 0) return null;
  const tour = rows[0].tournaments.tour;
  const [latest] = await getRankingDates(tour as "atp" | "wta");
  const rankOf = new Map((latest ? await getRankings(tour as "atp" | "wta", latest) : []).map((r) => [r.player.id, r.rank]));

  const byOpp = new Map<string, Rival>();
  const ordered = [...rows].sort((a, b) => (a.tournaments.start_date ?? "").localeCompare(b.tournaments.start_date ?? "") || a.id - b.id);
  for (const r of ordered) {
    if (r.result_detail === "walkover") continue;
    const mine = r.player1_id === playerId ? 1 : 2;
    const oppId = mine === 1 ? r.player2_id : r.player1_id;
    const oppName = (mine === 1 ? (r.p2?.full_name ?? r.player2_name) : (r.p1?.full_name ?? r.player1_name)) ?? "Unknown";
    const oppCountry = mine === 1 ? (r.p2?.country_code ?? r.player2_country) : (r.p1?.country_code ?? r.player1_country);
    const key = oppId !== null ? `id:${oppId}` : `name:${oppName.toLowerCase()}`;
    const won = r.winner_side === mine;
    const rival =
      byOpp.get(key) ??
      ({ key, id: oppId, name: oppName, country: oppCountry, rank: oppId !== null ? (rankOf.get(oppId) ?? null) : null, wins: 0, losses: 0, surfaces: { hard: [0, 0], clay: [0, 0], grass: [0, 0] } } as Rival);
    if (won) rival.wins++;
    else rival.losses++;
    const s = normalizeSurface(r.tournaments.surface);
    if (s) rival.surfaces[s][won ? 0 : 1]++;
    rival.last = { matchId: r.id, won, season: r.season, tournament: r.tournaments.name, round: r.round };
    byOpp.set(key, rival);
  }
  const rivals = [...byOpp.values()].sort((a, b) => b.wins + b.losses - (a.wins + a.losses) || (a.rank ?? 999) - (b.rank ?? 999) || a.name.localeCompare(b.name));
  const vs = (max: number): [number, number] =>
    rivals.filter((r) => r.rank !== null && r.rank <= max).reduce<[number, number]>((t, r) => [t[0] + r.wins, t[1] + r.losses], [0, 0]);
  return { tour, rivals, vsTop10: vs(10), vsTop100: vs(100), matches: rivals.reduce((n, r) => n + r.wins + r.losses, 0) };
});
