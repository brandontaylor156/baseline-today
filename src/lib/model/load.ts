import "server-only";

import type { AdminClient } from "@/lib/supabase/admin";
import { normalizeName } from "@/lib/wiki/names";
import { roundRank } from "@/lib/wiki/rows";

import { normalizeSurface, type EloMatch } from "./elo";

export interface LoadedMatch extends EloMatch {
  id: number;
  tour: "atp" | "wta";
  season: number | null;
  player1Id: number | null;
  player2Id: number | null;
  /** 5 for men's Grand Slam matches. */
  bestOf: 3 | 5;
}

/** Stable key: our player id when linked, else the normalized name (Italian spellings stay apart). */
export const playerKey = (id: number | null, name: string | null) => (id !== null ? `id:${id}` : `name:${normalizeName(name ?? "")}`);

/** All finished, confirmed singles results (walkovers excluded), ready for Elo. */
export async function loadResults(db: AdminClient): Promise<LoadedMatch[]> {
  const out: LoadedMatch[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("matches")
      .select("id, tour, season, round, winner_side, result_detail, set_scores, player1_id, player2_id, player1_name, player2_name, tournaments!inner(start_date, surface, category)")
      .eq("status", "final")
      .eq("confirmed", true)
      .not("winner_side", "is", null)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`load results: ${error.message}`);
    for (const r of (data ?? []) as unknown as {
      id: number;
      tour: "atp" | "wta";
      season: number | null;
      round: string | null;
      winner_side: number;
      result_detail: string | null;
      set_scores: unknown;
      player1_id: number | null;
      player2_id: number | null;
      player1_name: string | null;
      player2_name: string | null;
      tournaments: { start_date: string | null; surface: string | null; category: string | null };
    }[]) {
      if (r.result_detail === "walkover") continue;
      // The winner's share of games, for completed matches only (a retirement's score says little).
      const sets = ((Array.isArray(r.set_scores) ? r.set_scores : []) as { p1: number | null; p2: number | null }[]).filter((x) => x.p1 !== null && x.p2 !== null);
      const games = sets.reduce((t, x) => t + x.p1! + x.p2!, 0);
      const won = sets.reduce((t, x) => t + (r.winner_side === 1 ? x.p1! : x.p2!), 0);
      out.push({
        id: r.id,
        tour: r.tour,
        season: r.season,
        player1Id: r.player1_id,
        player2Id: r.player2_id,
        key1: playerKey(r.player1_id, r.player1_name),
        key2: playerKey(r.player2_id, r.player2_name),
        winner: r.winner_side as 1 | 2,
        surface: normalizeSurface(r.tournaments.surface),
        bestOf: r.tour === "atp" && /grand slam/i.test(r.tournaments.category ?? "") ? 5 : 3,
        winnerShare: r.result_detail === null && games > 0 ? won / games : null,
        order: `${r.tournaments.start_date ?? "0000-00-00"}|${String(roundRank(r.round)).padStart(2, "0")}|${String(r.id).padStart(10, "0")}`,
      });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}
