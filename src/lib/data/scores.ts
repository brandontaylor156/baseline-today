import "server-only";

import { liveChance, serveModelFor, stateFromScore } from "@/lib/live-prob";
import { bestOfFive, calibrate, newRating, normalizeSurface, winProbability, type Rating } from "@/lib/model/elo";
import type { MatchStatus, SetScore, Tour } from "@/lib/provider/types";
import { createPublicClient } from "@/lib/supabase/public";

import { getModelInfo } from "./predictions";
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
  const list = matches.data as unknown as Row[];
  const chances = await liveChances(db, list.filter((r) => r.is_live));
  return {
    groups: groupMatches(list.map((r) => ({ ...toMatch(r), winChance: chances.get(r.id) ?? null }))),
    freshness: {
      refreshedAt: times.length === 2 ? times.sort()[0] : null,
      unauthorized: rows.some((r) => r.status === "unauthorized"),
    },
  };
}

/** Which side serves, from the provider's server field. */
function serverIsP1(r: Row): boolean | null {
  const s = (r.server ?? "").toLowerCase();
  if (!s) return null;
  if (s === "1" || s === "player1" || (r.p1 && (s === String(r.p1.id) || s === r.p1.full_name.toLowerCase()))) return true;
  if (s === "2" || s === "player2" || (r.p2 && (s === String(r.p2.id) || s === r.p2.full_name.toLowerCase()))) return false;
  return null;
}

// Typical share of serve points won on each tour (sets the scale of the in-match model).
const SERVE_AVERAGE: Record<Tour, number> = { atp: 0.63, wta: 0.56 };

type Db = ReturnType<typeof createPublicClient>;

/** Player 1's chance to win each live match from the current score. */
async function liveChances(db: Db, live: Row[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const linked = live.filter((r) => r.p1 && r.p2);
  if (linked.length === 0) return out;
  const keys = [...new Set(linked.flatMap((r) => [`id:${r.p1!.id}`, `id:${r.p2!.id}`]))];
  const [{ data }, info] = await Promise.all([
    db.from("player_ratings").select("tour, player_key, elo, elo_hard, elo_clay, elo_grass, matches, hard_matches, clay_matches, grass_matches").in("player_key", keys),
    getModelInfo(),
  ]);
  const ratings = new Map<string, Rating>(
    (data ?? []).map((r) => [
      `${r.tour}|${r.player_key}`,
      { overall: r.elo, surface: { hard: r.elo_hard, clay: r.elo_clay, grass: r.elo_grass }, matches: r.matches, surfaceMatches: { hard: r.hard_matches, clay: r.clay_matches, grass: r.grass_matches } },
    ]),
  );
  for (const r of linked) {
    const tour = r.tour as Tour;
    const state = stateFromScore((Array.isArray(r.set_scores) ? r.set_scores : []) as SetScore[], r.player1_game_score, r.player2_game_score, serverIsP1(r));
    if (!state) continue;
    const fiveSets = tour === "atp" && /grand slam/i.test(r.tournaments.category ?? "");
    const base = calibrate(
      winProbability(ratings.get(`${tour}|id:${r.p1!.id}`) ?? newRating(), ratings.get(`${tour}|id:${r.p2!.id}`) ?? newRating(), normalizeSurface(r.tournaments.surface)),
      info.calibration[tour] ?? 1,
    );
    const pre = fiveSets ? bestOfFive(base) : base;
    out.set(r.id, liveChance(serveModelFor(pre, fiveSets ? 5 : 3, SERVE_AVERAGE[tour]), state));
  }
  return out;
}
