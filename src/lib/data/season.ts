import "server-only";

import { cache } from "react";

import type { SeasonMatch } from "@/lib/leaders";
import { playerKey } from "@/lib/model/load";
import type { Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";
import { roundRank } from "@/lib/wiki/rows";

type Row = {
  id: number;
  tour: Tour;
  season: number | null;
  round: string | null;
  winner_side: number | null;
  result_detail: string | null;
  set_scores: unknown;
  pre_match_p1: number | null;
  player1_id: number | null;
  player2_id: number | null;
  player1_name: string | null;
  player2_name: string | null;
  player1_country: string | null;
  player2_country: string | null;
  tournaments: { id: number; name: string; start_date: string | null; surface: string | null; category: string | null };
  p1: { id: number; full_name: string; country_code: string | null } | null;
  p2: { id: number; full_name: string; country_code: string | null } | null;
};

/** Every confirmed finished match of a season for one tour, shaped for stats and upsets. */
export const getSeasonMatches = cache(async (tour: Tour, season: number): Promise<SeasonMatch[]> => {
  const db = createPublicClient();
  const out: SeasonMatch[] = [];
  for (let from = 0, attempt = 0; ; from += 1000) {
    const { data, error } = await db
      .from("matches")
      .select(
        `id, tour, season, round, winner_side, result_detail, set_scores, pre_match_p1, player1_id, player2_id,
         player1_name, player2_name, player1_country, player2_country,
         tournaments!inner(id, name, start_date, surface, category),
         p1:players!matches_player1_id_fkey(id, full_name, country_code),
         p2:players!matches_player2_id_fkey(id, full_name, country_code)`,
      )
      .eq("status", "final")
      .eq("confirmed", true)
      .eq("tour", tour)
      .eq("season", season)
      .not("winner_side", "is", null)
      .order("id")
      .range(from, from + 999);
    // A busy database can cancel a page (statement timeout, 57014): retry it twice before failing.
    if (error?.code === "57014" && attempt < 2) {
      attempt++;
      from -= 1000;
      continue;
    }
    if (error) throw new Error(`season matches: ${error.message}`);
    attempt = 0;
    for (const r of (data ?? []) as unknown as Row[]) {
      const side = (p: Row["p1"], id: number | null, name: string | null, country: string | null) => ({
        key: playerKey(p?.id ?? id, p?.full_name ?? name),
        id: p?.id ?? id,
        name: p?.full_name ?? name ?? "Unknown",
        country: p?.country_code ?? country,
      });
      out.push({
        id: r.id,
        season: r.season,
        date: r.tournaments.start_date ?? "0000-00-00",
        roundRank: roundRank(r.round),
        round: r.round,
        surface: r.tournaments.surface,
        bestOf: r.tour === "atp" && /grand slam/i.test(r.tournaments.category ?? "") ? 5 : 3,
        side: 1,
        winner: r.winner_side as 1 | 2,
        walkover: r.result_detail === "walkover",
        retired: r.result_detail === "retired",
        sets: (Array.isArray(r.set_scores) ? r.set_scores : []) as { p1: number | null; p2: number | null }[],
        tour: r.tour,
        tournamentId: r.tournaments.id,
        tournamentName: r.tournaments.name,
        p1: side(r.p1, r.player1_id, r.player1_name, r.player1_country),
        p2: side(r.p2, r.player2_id, r.player2_name, r.player2_country),
        preMatchP1: r.pre_match_p1,
      });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
});
