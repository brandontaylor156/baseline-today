import "server-only";

import { runLab, type LabMatch } from "@/lib/lab/engine";
import { normalizeSurface } from "@/lib/model/elo";
import { playerKey } from "@/lib/model/load";
import type { AdminClient } from "@/lib/supabase/admin";
import { roundRank } from "@/lib/wiki/rows";

const BATCH = 1000;

type Row = {
  id: number;
  tour: "atp" | "wta";
  round: string | null;
  winner_side: number;
  result_detail: string | null;
  player1_id: number | null;
  player2_id: number | null;
  player1_name: string | null;
  player2_name: string | null;
  tournament_id: number;
  tournaments: { start_date: string | null; surface: string | null; category: string | null };
};

/** Every confirmed result (walkovers included, for the draw shape), in engine form. */
async function loadLabMatches(db: AdminClient): Promise<LabMatch[]> {
  const out: LabMatch[] = [];
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await db
      .from("matches")
      .select("id, tour, round, winner_side, result_detail, player1_id, player2_id, player1_name, player2_name, tournament_id, tournaments!inner(start_date, surface, category)")
      .eq("status", "final")
      .eq("confirmed", true)
      .in("winner_side", [1, 2])
      .order("id")
      .range(from, from + BATCH - 1);
    if (error) throw new Error(`lab: load results: ${error.message}`);
    for (const r of (data ?? []) as unknown as Row[]) {
      if (!r.tournaments.start_date) continue;
      out.push({
        id: r.id,
        tour: r.tour,
        tournamentId: r.tournament_id,
        startDate: r.tournaments.start_date,
        round: roundRank(r.round),
        key1: playerKey(r.player1_id, r.player1_name),
        key2: playerKey(r.player2_id, r.player2_name),
        winner: r.winner_side as 1 | 2,
        surface: normalizeSurface(r.tournaments.surface),
        bestOf: r.tour === "atp" && /grand slam/i.test(r.tournaments.category ?? "") ? 5 : 3,
        walkover: r.result_detail === "walkover",
      });
    }
    if (!data || data.length < BATCH) break;
  }
  return out;
}

const idOf = (key: string) => (key.startsWith("id:") ? Number(key.slice(3)) : null);

/**
 * Recomputes the research lab from scratch: replays every result, rebuilds each draw, stores each
 * entrant's pre-tournament title chance and weekly ratings. Takes a minute; run weekly.
 */
export async function computeLab(db: AdminClient) {
  const started = Date.now();
  const [matches, { data: model }] = await Promise.all([loadLabMatches(db), db.from("sync_state").select("details").eq("key", "model").maybeSingle()]);
  const calibration = ((model?.details ?? {}) as { calibration?: Record<string, number> }).calibration ?? {};
  const { titles, ratings, drawsTried, drawsBuilt } = runLab(matches, calibration);

  // Only finished draws: a tournament in progress gets its row once it's over.
  const finals = new Set(titles.filter((t) => t.champion).map((t) => t.tournamentId));
  const titleRows = titles
    .filter((t) => finals.has(t.tournamentId))
    .map((t) => ({ tournament_id: t.tournamentId, player_key: t.key, player_id: idOf(t.key), chance: Math.round(t.chance * 1e6) / 1e6, champion: t.champion, rating: t.rating }));
  for (let i = 0; i < titleRows.length; i += BATCH) {
    const { error } = await db.from("lab_title_chances").upsert(titleRows.slice(i, i + BATCH), { onConflict: "tournament_id,player_key" });
    if (error) throw new Error(`lab: title chances: ${error.message}`);
  }
  const ratingRows = ratings.map((r) => ({
    player_key: r.key,
    player_id: idOf(r.key),
    tour: r.tour,
    week: r.week,
    overall: Math.round(r.overall * 10) / 10,
    hard: Math.round(r.hard * 10) / 10,
    clay: Math.round(r.clay * 10) / 10,
    grass: Math.round(r.grass * 10) / 10,
    matches: r.matches,
  }));
  for (let i = 0; i < ratingRows.length; i += BATCH) {
    const { error } = await db.from("lab_ratings").upsert(ratingRows.slice(i, i + BATCH), { onConflict: "player_key,week" });
    if (error) throw new Error(`lab: ratings: ${error.message}`);
  }
  return { matches: matches.length, drawsTried, drawsBuilt, titleRows: titleRows.length, ratingRows: ratingRows.length, seconds: Math.round((Date.now() - started) / 1000) };
}
