import "server-only";

import { cache } from "react";

import { playerStats, type PlayerStats, type StatMatch } from "@/lib/stats";
import { createPublicClient } from "@/lib/supabase/public";
import { roundRank } from "@/lib/wiki/rows";

type Row = {
  id: number;
  provider: string;
  season: number | null;
  round: string | null;
  winner_side: number | null;
  result_detail: string | null;
  set_scores: unknown;
  player1_id: number | null;
  player2_id: number | null;
  tournaments: { start_date: string | null; surface: string | null; category: string | null; tour: string };
};

/** All tracked finished matches of a player as StatMatch rows (walkovers flagged). */
async function loadStatMatches(playerId: number): Promise<StatMatch[]> {
  const db = createPublicClient();
  const { data, error } = await db
    .from("matches")
    .select("id, provider, season, round, winner_side, result_detail, set_scores, player1_id, player2_id, tournaments!inner(start_date, surface, category, tour)")
    .eq("status", "final")
    .eq("confirmed", true)
    .not("winner_side", "is", null)
    .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)
    .limit(1000);
  if (error) throw new Error(`player stats: ${error.message}`);
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    season: r.season,
    date: r.tournaments.start_date ?? "0000-00-00",
    roundRank: roundRank(r.round),
    round: r.round,
    surface: r.tournaments.surface,
    bestOf: r.tournaments.tour === "atp" && /grand slam/i.test(r.tournaments.category ?? "") ? 5 : 3,
    side: r.player1_id === playerId ? 1 : 2,
    winner: r.winner_side as 1 | 2,
    walkover: r.result_detail === "walkover",
    retired: r.result_detail === "retired",
    sets: (Array.isArray(r.set_scores) ? r.set_scores : []) as { p1: number | null; p2: number | null }[],
  }));
}

export const getPlayerStats = cache(async (playerId: number, season: number): Promise<{ season: PlayerStats; all: PlayerStats; since: number | null }> => {
  const matches = await loadStatMatches(playerId);
  const seasons = matches.map((m) => m.season).filter((s): s is number => s !== null);
  return {
    season: playerStats(matches.filter((m) => m.season === season)),
    all: playerStats(matches),
    since: seasons.length ? Math.min(...seasons) : null,
  };
});
