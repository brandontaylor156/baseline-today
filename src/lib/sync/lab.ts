import "server-only";

import { clutchStats, type ClutchMatch } from "@/lib/lab/clutch";
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
  set_scores: unknown;
  pre_match_p1: number | null;
  player1_id: number | null;
  player2_id: number | null;
  player1_name: string | null;
  player2_name: string | null;
  tournament_id: number;
  tournaments: { start_date: string | null; surface: string | null; category: string | null };
};

/** Every confirmed result (walkovers included, for the draw shape) in engine form, plus the matches the clutch index scores. */
async function loadLabMatches(db: AdminClient): Promise<{ matches: LabMatch[]; clutch: ClutchMatch[] }> {
  const out: LabMatch[] = [];
  const clutch: ClutchMatch[] = [];
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await db
      .from("matches")
      .select("id, tour, round, winner_side, result_detail, set_scores, pre_match_p1, player1_id, player2_id, player1_name, player2_name, tournament_id, tournaments!inner(start_date, surface, category)")
      .eq("status", "final")
      .eq("confirmed", true)
      .in("winner_side", [1, 2])
      .order("id")
      .range(from, from + BATCH - 1);
    if (error) throw new Error(`lab: load results: ${error.message}`);
    for (const r of (data ?? []) as unknown as Row[]) {
      if (!r.tournaments.start_date) continue;
      const lab: LabMatch = {
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
      };
      out.push(lab);
      // Clutch: completed matches the model predicted (retirements end early, so they're left out).
      if (r.pre_match_p1 !== null && !r.result_detail) {
        const sets = ((Array.isArray(r.set_scores) ? r.set_scores : []) as { p1: number | null; p2: number | null }[])
          .filter((x) => x.p1 !== null && x.p2 !== null)
          .map((x) => [x.p1!, x.p2!] as [number, number]);
        if (sets.length >= 2) clutch.push({ tour: r.tour, key1: lab.key1, key2: lab.key2, winner: lab.winner, bestOf: lab.bestOf, p1: r.pre_match_p1, sets });
      }
    }
    if (!data || data.length < BATCH) break;
  }
  return { matches: out, clutch };
}

const idOf = (key: string) => (key.startsWith("id:") ? Number(key.slice(3)) : null);

/**
 * Recomputes the research lab from scratch: replays every result, rebuilds each draw, stores each
 * entrant's pre-tournament title chance and weekly ratings. Takes a minute; run weekly.
 */
export async function computeLab(db: AdminClient) {
  const started = Date.now();
  const [{ matches, clutch }, { data: model }] = await Promise.all([loadLabMatches(db), db.from("sync_state").select("details").eq("key", "model").maybeSingle()]);
  const calibration = ((model?.details ?? {}) as { calibration?: Record<string, number> }).calibration ?? {};
  const { titles, ratings, denied, drawsTried, drawsBuilt } = runLab(matches, calibration);

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
  // Pairs are recomputed whole: clear, then write.
  const { error: clearErr } = await db.from("lab_denied").delete().gte("gain", 0);
  if (clearErr) throw new Error(`lab: clear denied: ${clearErr.message}`);
  const deniedRows = denied.map((d) => ({ tour: d.tour, player_key: d.player, other_key: d.other, player_id: idOf(d.player), other_id: idOf(d.other), gain: Math.round(d.gain * 1000) / 1000 }));
  for (let i = 0; i < deniedRows.length; i += BATCH) {
    const { error } = await db.from("lab_denied").upsert(deniedRows.slice(i, i + BATCH), { onConflict: "player_key,other_key" });
    if (error) throw new Error(`lab: denied: ${error.message}`);
  }
  const clutchRows = clutchStats(clutch)
    .filter((c) => c.tiebreaks.n + c.deciders.n >= 10)
    .map((c) => ({
      player_key: c.key,
      player_id: idOf(c.key),
      tour: c.tour,
      tb_n: c.tiebreaks.n,
      tb_won: c.tiebreaks.won,
      tb_expected: Math.round(c.tiebreaks.expected * 100) / 100,
      tb_variance: Math.round(c.tiebreaks.variance * 100) / 100,
      dec_n: c.deciders.n,
      dec_won: c.deciders.won,
      dec_expected: Math.round(c.deciders.expected * 100) / 100,
      dec_variance: Math.round(c.deciders.variance * 100) / 100,
    }));
  for (let i = 0; i < clutchRows.length; i += BATCH) {
    const { error } = await db.from("lab_clutch").upsert(clutchRows.slice(i, i + BATCH), { onConflict: "player_key" });
    if (error) throw new Error(`lab: clutch: ${error.message}`);
  }
  return {
    clutchRows: clutchRows.length,
    matches: matches.length,
    drawsTried,
    drawsBuilt,
    titleRows: titleRows.length,
    ratingRows: ratingRows.length,
    deniedRows: deniedRows.length,
    seconds: Math.round((Date.now() - started) / 1000),
  };
}
