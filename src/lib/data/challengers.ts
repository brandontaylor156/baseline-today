import "server-only";

import { cache } from "react";

import { createPublicClient } from "@/lib/supabase/public";

export interface ChallengerResult {
  event: string;
  season: number;
  startDate: string | null;
  round: string | null;
  roundRank: number;
  opponent: string;
  won: boolean;
  score: string;
  drawTitle: string;
}

export interface ChallengerSeason {
  season: number;
  wins: number;
  losses: number;
  titles: number;
}

/**
 * A player's ATP Challenger results (from Wikipedia draws), found by the names their tour results
 * use: both come from the same Wikipedia link targets.
 */
export const getChallengerRecord = cache(async (playerId: number): Promise<{ seasons: ChallengerSeason[]; recent: ChallengerResult[] } | null> => {
  const db = createPublicClient();
  const [{ data: a }, { data: b }] = await Promise.all([
    db.from("matches").select("player1_name").eq("player1_id", playerId).not("player1_name", "is", null).limit(200),
    db.from("matches").select("player2_name").eq("player2_id", playerId).not("player2_name", "is", null).limit(200),
  ]);
  const names = [...new Set([...(a ?? []).map((r) => r.player1_name!), ...(b ?? []).map((r) => r.player2_name!)])].slice(0, 5);
  if (names.length === 0) return null;
  const list = names.map((n) => `"${n.replace(/"/g, '\\"')}"`).join(",");
  const { data } = await db
    .from("challenger_matches")
    .select("round, round_rank, player1_name, player2_name, winner_side, set_scores, result_detail, challenger_events!inner(name, season, start_date, draw_title)")
    .or(`player1_name.in.(${list}),player2_name.in.(${list})`)
    .limit(1000);
  type R = {
    round: string | null;
    round_rank: number;
    player1_name: string;
    player2_name: string;
    winner_side: number | null;
    set_scores: { p1: number | null; p2: number | null }[];
    result_detail: string | null;
    challenger_events: { name: string; season: number; start_date: string | null; draw_title: string };
  };
  const rows = ((data ?? []) as unknown as R[]).filter((r) => r.winner_side === 1 || r.winner_side === 2);
  if (rows.length === 0) return null;
  const mine = new Set(names);
  const results: ChallengerResult[] = rows.map((r) => {
    const side = mine.has(r.player1_name) ? 1 : 2;
    const sets = (Array.isArray(r.set_scores) ? r.set_scores : []).filter((s) => s.p1 !== null && s.p2 !== null);
    return {
      event: r.challenger_events.name,
      season: r.challenger_events.season,
      startDate: r.challenger_events.start_date,
      round: r.round,
      roundRank: r.round_rank,
      opponent: side === 1 ? r.player2_name : r.player1_name,
      won: r.winner_side === side,
      score: sets.map((s) => (side === 1 ? `${s.p1}–${s.p2}` : `${s.p2}–${s.p1}`)).join(" ") + (r.result_detail === "retired" ? " ret." : r.result_detail === "walkover" ? " w/o" : ""),
      drawTitle: r.challenger_events.draw_title,
    };
  });
  const seasons = new Map<number, ChallengerSeason>();
  for (const r of results) {
    const s = seasons.get(r.season) ?? { season: r.season, wins: 0, losses: 0, titles: 0 };
    if (r.won) s.wins++;
    else s.losses++;
    if (r.won && /^final$/i.test(r.round ?? "")) s.titles++;
    seasons.set(r.season, s);
  }
  return {
    seasons: [...seasons.values()].sort((x, y) => y.season - x.season),
    recent: results.sort((x, y) => (y.startDate ?? "").localeCompare(x.startDate ?? "") || x.drawTitle.localeCompare(y.drawTitle) || y.roundRank - x.roundRank).slice(0, 12),
  };
});
