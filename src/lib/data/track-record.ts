import "server-only";

import { cache } from "react";

import { TOURS } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";
import { trackRecord, type ScoredMatch, type TrackRecord } from "@/lib/track-record";

import { getRankingDates, getRankings } from "./tennis";
import { displayName } from "./tournaments";

/** The model's record at tournaments played in the last `days` days (walkovers excluded). */
export const getTrackRecord = cache(async (days = 7): Promise<TrackRecord & { since: string }> => {
  // By tournament dates: when a result was stored says nothing (season imports stored old ones).
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const db = createPublicClient();
  // Tournaments first, then their matches (an embedded date filter would check every stored result).
  const { data: inWindow } = await db.from("tournaments").select("id").gte("end_date", since).lte("start_date", today).limit(300);
  const [{ data, error }, rankings] = await Promise.all([
    db
      .from("matches")
      .select(
        "id, round, winner_side, result_detail, pre_match_p1, player1_id, player2_id, player1_name, player2_name, tournaments!inner(name, start_date, end_date), p1:players!matches_player1_id_fkey(full_name), p2:players!matches_player2_id_fkey(full_name)",
      )
      .eq("status", "final")
      .eq("confirmed", true)
      .not("pre_match_p1", "is", null)
      .not("winner_side", "is", null)
      .in("tournament_id", (inWindow ?? []).map((t) => t.id).concat(-1))
      .limit(2000),
    Promise.all(
      TOURS.map(async (t) => {
        const [latest] = await getRankingDates(t);
        return latest ? getRankings(t, latest) : [];
      }),
    ),
  ]);
  if (error) throw new Error(`track record: ${error.message}`);
  const rankOf = new Map(rankings.flat().map((r) => [r.player.id, r.rank]));
  const matches: ScoredMatch[] = (data ?? [])
    .filter((m) => m.result_detail !== "walkover" && (m.winner_side === 1 || m.winner_side === 2))
    .map((m) => ({
      id: m.id,
      tournament: displayName(m.tournaments.name),
      round: m.round,
      p1: { id: m.player1_id, name: m.p1?.full_name ?? m.player1_name ?? "?", rank: m.player1_id !== null ? (rankOf.get(m.player1_id) ?? null) : null },
      p2: { id: m.player2_id, name: m.p2?.full_name ?? m.player2_name ?? "?", rank: m.player2_id !== null ? (rankOf.get(m.player2_id) ?? null) : null },
      winner: m.winner_side as 1 | 2,
      p1Chance: m.pre_match_p1!,
    }));
  return { ...trackRecord(matches), since };
});
