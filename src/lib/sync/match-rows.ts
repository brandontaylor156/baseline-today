// Pure helpers for match sync and trial measurement (unit tested).

import type { ProviderMatch, ProviderTournament, SetScore } from "@/lib/provider/types";
import type { Json, TablesInsert } from "@/lib/supabase/database.types";

export function tournamentRow(t: ProviderTournament, provider: string, now: Date): TablesInsert<"tournaments"> {
  return {
    tour: t.tour,
    provider,
    provider_id: t.providerId,
    name: t.name,
    location: t.location,
    surface: t.surface,
    category: t.category,
    season: t.season,
    start_date: t.startDate,
    end_date: t.endDate,
    draw_size: t.drawSize,
    updated_at: now.toISOString(),
  };
}

/** Everything that counts as "the score changed" (sets, games, points, status). */
export function scoreSignature(m: {
  status: string;
  score: string | null;
  set_scores: Json;
  player1_game_score: string | null;
  player2_game_score: string | null;
}): string {
  return JSON.stringify([m.status, m.score, m.set_scores, m.player1_game_score, m.player2_game_score]);
}

export function matchRow(
  m: ProviderMatch,
  provider: string,
  ids: { tournamentId: number; player1Id: number | null; player2Id: number | null },
  now: Date,
): TablesInsert<"matches"> {
  return {
    tour: m.tour,
    provider,
    provider_id: m.providerId,
    tournament_id: ids.tournamentId,
    season: m.season,
    round: m.round,
    player1_id: ids.player1Id,
    player2_id: ids.player2Id,
    winner_id: m.winner === 1 ? ids.player1Id : m.winner === 2 ? ids.player2Id : null,
    status: m.status,
    result_detail: m.resultDetail,
    is_live: m.isLive,
    score: m.score,
    set_scores: m.sets as unknown as Json,
    player1_game_score: m.p1GameScore,
    player2_game_score: m.p2GameScore,
    server: m.server,
    scheduled_at: m.scheduledAt,
    not_before_text: m.notBeforeText,
    duration: m.duration,
    updated_at: now.toISOString(),
  };
}

/** Tournaments in play around today (UTC dates, a day of slack for time zones). */
export function activeWindow(now: Date): { from: string; to: string } {
  const day = 24 * 60 * 60 * 1000;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { from: iso(new Date(now.getTime() - day)), to: iso(new Date(now.getTime() + day)) };
}

// --- Trial measurement -----------------------------------------------------------------------

/** "6-4 2-3": games per set, comparable across sources. */
export function gamesState(sets: Pick<SetScore, "p1" | "p2">[]): string {
  return sets
    .filter((s) => s.p1 !== null || s.p2 !== null)
    .map((s) => `${s.p1 ?? 0}-${s.p2 ?? 0}`)
    .join(" ");
}

function lastNameToken(name: string): string {
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[đĐ]/g, "dj")
    .toLowerCase()
    .replace(/[^a-z\s-]/g, "")
    .split(/\s+/)
    .filter(Boolean);
  return words.at(-1) ?? "";
}

/**
 * Pairs the same match across sources: sorted last-name tokens. Player order differs between
 * sources, so set scores are compared after orienting both to this key's order.
 */
export function playersKey(name1: string, name2: string): { key: string; flipped: boolean } {
  const a = lastNameToken(name1);
  const b = lastNameToken(name2);
  return a <= b ? { key: `${a}|${b}`, flipped: false } : { key: `${b}|${a}`, flipped: true };
}

/** Games state oriented to playersKey order, so both sources produce identical strings. */
export function orientedGamesState(sets: Pick<SetScore, "p1" | "p2">[], flipped: boolean): string {
  return gamesState(flipped ? sets.map((s) => ({ p1: s.p2, p2: s.p1 })) : sets);
}
