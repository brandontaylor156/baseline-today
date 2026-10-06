import "server-only";

import { cache } from "react";

import type { Line } from "@/lib/lab/explorer";
import { createPublicClient } from "@/lib/supabase/public";
import { roundRank } from "@/lib/wiki/rows";

import { displayName } from "./tournaments";

type Row = {
  id: number;
  season: number | null;
  round: string | null;
  winner_side: number;
  result_detail: string | null;
  set_scores: unknown;
  pre_match_p1: number | null;
  player1_id: number | null;
  player2_id: number | null;
  player1_name: string | null;
  player2_name: string | null;
  player1_country: string | null;
  player2_country: string | null;
  p1: { full_name: string; country_code: string | null } | null;
  p2: { full_name: string; country_code: string | null } | null;
  tournaments: { id: number; name: string; start_date: string | null; surface: string | null; category: string | null };
};

const surfaceOf = (s: string | null): Line["surface"] => (!s ? null : /clay/i.test(s) ? "Clay" : /grass/i.test(s) ? "Grass" : "Hard");

/** Every tracked result of one player since 2015, from their side, newest first. */
export const getPlayerLines = cache(async (playerId: number): Promise<Line[]> => {
  const db = createPublicClient();
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("matches")
      .select(
        "id, season, round, winner_side, result_detail, set_scores, pre_match_p1, player1_id, player2_id, player1_name, player2_name, player1_country, player2_country, p1:players!matches_player1_id_fkey(full_name, country_code), p2:players!matches_player2_id_fkey(full_name, country_code), tournaments!inner(id, name, start_date, surface, category)",
      )
      .eq("status", "final")
      .eq("confirmed", true)
      .in("winner_side", [1, 2])
      .or(`player1_id.eq.${playerId},player2_id.eq.${playerId}`)
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`explorer: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Row[]));
    if (!data || data.length < 1000) break;
  }
  return rows
    .map((r): Line => {
      const me = r.player1_id === playerId ? 1 : 2;
      const sets = ((Array.isArray(r.set_scores) ? r.set_scores : []) as { p1: number | null; p2: number | null }[])
        .filter((s) => s.p1 !== null && s.p2 !== null)
        .map((s) => (me === 1 ? [s.p1!, s.p2!] : [s.p2!, s.p1!]) as [number, number]);
      return {
        matchId: r.id,
        season: r.season,
        date: r.tournaments.start_date ?? "",
        tournamentId: r.tournaments.id,
        tournament: displayName(r.tournaments.name),
        category: r.tournaments.category,
        surface: surfaceOf(r.tournaments.surface),
        round: r.round,
        // roundRank runs 3 (first round) … 9 (final); the explorer uses 1 … 7.
        roundRank: Math.min(7, Math.max(1, roundRank(r.round) - 2)),
        opponent:
          me === 1
            ? { id: r.player2_id, name: r.p2?.full_name ?? r.player2_name ?? "?", country: r.p2?.country_code ?? r.player2_country }
            : { id: r.player1_id, name: r.p1?.full_name ?? r.player1_name ?? "?", country: r.p1?.country_code ?? r.player1_country },
        won: r.winner_side === me,
        sets,
        chance: r.pre_match_p1 === null ? null : me === 1 ? r.pre_match_p1 : 1 - r.pre_match_p1,
        retired: r.result_detail === "retired",
        walkover: r.result_detail === "walkover",
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.roundRank - a.roundRank);
});
