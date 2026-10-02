import "server-only";

import type { MatchStatus, SetScore, Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";

import { groupMatches, type ScoreMatch, type TournamentGroup } from "./scores-group";

export type { ScoreMatch, TournamentGroup };

const HOUR = 60 * 60 * 1000;

const SELECT = `id, tour, round, status, result_detail, is_live, score, set_scores, player1_game_score,
  player2_game_score, server, scheduled_at, not_before_text, score_changed_at, updated_at, winner_id,
  tournaments!inner(id, name, category, location, surface),
  p1:players!matches_player1_id_fkey(id, full_name, country_code),
  p2:players!matches_player2_id_fkey(id, full_name, country_code)`;

type Row = {
  id: number;
  tour: string;
  round: string | null;
  status: string;
  result_detail: string | null;
  is_live: boolean;
  score: string | null;
  set_scores: unknown;
  player1_game_score: string | null;
  player2_game_score: string | null;
  server: string | null;
  scheduled_at: string | null;
  not_before_text: string | null;
  score_changed_at: string | null;
  updated_at: string;
  winner_id: number | null;
  tournaments: { id: number; name: string; category: string | null; location: string | null; surface: string | null };
  p1: { id: number; full_name: string; country_code: string | null } | null;
  p2: { id: number; full_name: string; country_code: string | null } | null;
};

function toMatch(r: Row): ScoreMatch {
  const side = (p: Row["p1"]) => (p ? { id: p.id, name: p.full_name, countryCode: p.country_code } : null);
  return {
    id: r.id,
    tour: r.tour as Tour,
    tournament: { id: r.tournaments.id, name: r.tournaments.name, category: r.tournaments.category },
    round: r.round,
    status: r.status as MatchStatus,
    resultDetail: r.result_detail,
    isLive: r.is_live,
    sets: (Array.isArray(r.set_scores) ? r.set_scores : []) as SetScore[],
    p1Game: r.player1_game_score,
    p2Game: r.player2_game_score,
    server: r.server,
    scheduledAt: r.scheduled_at,
    notBefore: r.not_before_text,
    player1: side(r.p1),
    player2: side(r.p2),
    winner: r.winner_id === null ? null : r.winner_id === r.p1?.id ? 1 : r.winner_id === r.p2?.id ? 2 : null,
  };
}

export interface Freshness {
  /** Oldest successful refresh across tours, ISO, or null if never. */
  refreshedAt: string | null;
  /** True when the provider rejected the key (free tier). */
  unauthorized: boolean;
}

/** Live matches plus the day's schedule and results (roughly the last 14h to the next 20h). */
export async function getScores(now = new Date()): Promise<{ groups: TournamentGroup[]; freshness: Freshness }> {
  const db = createPublicClient({ cached: false });
  const from = new Date(now.getTime() - 14 * HOUR).toISOString();
  const to = new Date(now.getTime() + 20 * HOUR).toISOString();

  const [matches, state] = await Promise.all([
    db
      .from("matches")
      .select(SELECT)
      .or(`is_live.eq.true,status.eq.in_progress,and(scheduled_at.gte.${from},scheduled_at.lte.${to})`)
      .order("scheduled_at", { ascending: true, nullsFirst: false })
      .limit(400),
    db.from("sync_state").select("key, last_refreshed_at, status").in("key", ["live:atp", "live:wta"]),
  ]);
  if (matches.error) throw new Error(`scores: ${matches.error.message}`);

  const rows = state.data ?? [];
  const times = rows.map((r) => r.last_refreshed_at).filter((t): t is string => Boolean(t));
  return {
    groups: groupMatches((matches.data as unknown as Row[]).map(toMatch)),
    freshness: {
      refreshedAt: times.length === 2 ? times.sort()[0] : null,
      unauthorized: rows.some((r) => r.status === "unauthorized"),
    },
  };
}
