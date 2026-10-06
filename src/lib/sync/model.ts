import "server-only";

import { bestOfFive, calibrate, evaluate, fitCalibration, marginMultiplier, runElo } from "@/lib/model/elo";
import { loadResults } from "@/lib/model/load";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

const BATCH = 1000;

/** Monday of the week containing a YYYY-MM-DD date (null for placeholder dates). */
export function mondayOf(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith("0000")) return null;
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * Recomputes the Elo model from every stored result: player ratings, a calibration factor per tour
 * (fitted on the previous season, so displayed probabilities match how often favourites win), and
 * each match's calibrated pre-match probability (used for upsets).
 */
export async function computeModel(db: AdminClient, now = new Date()) {
  const results = await loadResults(db);
  const season = now.getUTCFullYear();
  const seasonByOrder = new Map(results.map((m) => [m.order, m.season]));
  const calibration: Record<string, number> = {};
  const summary: Record<string, { players: number; matches: number }> = {};
  // Out-of-sample accuracy of this season so far (calibration was fitted on last season).
  const backtest: Record<string, { n: number; accuracy: number; logLoss: number; brier: number; buckets: { bucket: string; n: number; predicted: number; actual: number }[] }> = {};

  // Names for unlinked players come from the results themselves; last played from the sort key.
  const nameOf = new Map<string, string>();
  const lastPlayed = new Map<string, string>();
  for (const m of results) {
    if (m.key1.startsWith("name:")) nameOf.set(m.key1, m.key1.slice(5));
    if (m.key2.startsWith("name:")) nameOf.set(m.key2, m.key2.slice(5));
    const date = m.order.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(date) && date !== "0000-00-00") {
      for (const k of [m.key1, m.key2]) if (date > (lastPlayed.get(k) ?? "")) lastPlayed.set(k, date);
    }
  }

  for (const tour of ["atp", "wta"] as const) {
    const tourResults = results.filter((m) => m.tour === tour);
    // Rating after each player's last match of a week, for linked players.
    const weekly = new Map<string, { player_id: number; week: string; elo: number }>();
    const record = (key: string, week: string, elo: number) => {
      if (!key.startsWith("id:")) return;
      const player_id = Number(key.slice(3));
      weekly.set(`${player_id}|${week}`, { player_id, week, elo: Math.round(elo * 10) / 10 });
    };
    const { ratings, predictions } = runElo(tourResults, (m, a, b) => {
      const week = mondayOf(m.order.slice(0, 10));
      if (!week) return;
      record(m.key1, week, a.overall);
      record(m.key2, week, b.overall);
    }, (m) => marginMultiplier(m.winnerShare));
    const fitOn = predictions.filter((p) => seasonByOrder.get(p.match.order) === season - 1);
    const c = fitOn.length >= 200 ? fitCalibration(fitOn) : 1;
    calibration[tour] = Number(c.toFixed(4));
    // Men's Grand Slams are best of five: the same set-level strength, a longer match.
    const bestOf = new Map(tourResults.map((m) => [m.order, m.bestOf]));
    const final = (p: { match: { order: string }; p1: number }) => {
      const q = calibrate(p.p1, c);
      return bestOf.get(p.match.order) === 5 ? bestOfFive(q) : q;
    };
    const thisSeason = predictions.filter((p) => seasonByOrder.get(p.match.order) === season).map((p) => ({ ...p, p1: final(p) }));
    const e = evaluate(thisSeason);
    backtest[tour] = {
      n: e.n,
      accuracy: Number(e.accuracy.toFixed(4)),
      logLoss: Number(e.logLoss.toFixed(4)),
      brier: Number(e.brier.toFixed(4)),
      buckets: e.calibration.map((b) => ({ ...b, predicted: Number(b.predicted.toFixed(4)), actual: Number(b.actual.toFixed(4)) })),
    };

    const rows = [...ratings.entries()].map(([key, r]) => ({
      tour,
      player_key: key,
      player_id: key.startsWith("id:") ? Number(key.slice(3)) : null,
      name: nameOf.get(key) ?? null,
      elo: r.overall,
      elo_hard: r.surface.hard,
      elo_clay: r.surface.clay,
      elo_grass: r.surface.grass,
      matches: r.matches,
      hard_matches: r.surfaceMatches.hard,
      clay_matches: r.surfaceMatches.clay,
      grass_matches: r.surfaceMatches.grass,
      last_played: lastPlayed.get(key) ?? null,
      updated_at: now.toISOString(),
    }));
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await db.from("player_ratings").upsert(rows.slice(i, i + BATCH), { onConflict: "tour,player_key" });
      if (error) throw new Error(`save ratings: ${error.message}`);
    }

    const idByOrder = new Map(tourResults.map((m) => [m.order, m.id]));
    const probs = predictions.map((p) => ({ id: idByOrder.get(p.match.order)!, p: Number(final(p).toFixed(4)) }));
    for (let i = 0; i < probs.length; i += BATCH) {
      const { error } = await db.rpc("set_pre_match_probs", { p_rows: probs.slice(i, i + BATCH) as unknown as Json });
      if (error) throw new Error(`save probabilities: ${error.message}`);
    }
    const history = [...weekly.values()].map((h) => ({ ...h, tour }));
    for (let i = 0; i < history.length; i += BATCH) {
      const { error } = await db.from("player_rating_history").upsert(history.slice(i, i + BATCH), { onConflict: "player_id,week" });
      if (error) throw new Error(`save rating history: ${error.message}`);
    }
    summary[tour] = { players: rows.length, matches: probs.length };
  }

  await db.from("sync_state").upsert({ key: "model", last_refreshed_at: now.toISOString(), status: "ok", details: { calibration, summary, backtest, season } as Json });
  return { calibration, summary, backtest };
}
