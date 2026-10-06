import "server-only";

import { asRating, FACTORS, factorRows, fitLogistic, logLoss, type FactorMatch, type FactorRow } from "@/lib/lab/factors";
import { playerKey } from "@/lib/model/load";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { hostCountry } from "@/lib/venue";
import { roundRank } from "@/lib/wiki/rows";

const BATCH = 1000;
/** 2015 is burn-in (everyone is new to the record, layoffs can't be seen). */
export const FROM = "2016-01-01";
/** Fit on everything before this date, test on everything after. */
export const HOLDOUT = "2023-01-01";

export interface FactorResult {
  key: string;
  label: string;
  unit: string;
  /** Matches where the two players differ on the factor. */
  matches: number;
  /** Effect in rating points, with a 95% interval (fitted on all data). */
  points: number;
  low: number;
  high: number;
  /** Change in holdout log loss from adding just this factor to the model (negative = better). */
  holdout: number;
}

export interface FactorsCache {
  generated: string;
  from: string;
  holdoutFrom: string;
  tours: Record<
    string,
    {
      matches: number;
      /** The model's own calibration on top of its logit (1 = calibrated). */
      slope: number;
      factors: FactorResult[];
      /** Holdout log loss: model alone, and model plus every factor (fitted before the holdout). */
      base: number;
      full: number;
    }
  >;
}

type Row = {
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
  player1_country: string | null;
  player2_country: string | null;
  tournament_id: number;
  tournaments: { start_date: string | null; surface: string | null; category: string | null; location: string | null };
};

async function loadMatches(db: AdminClient): Promise<Record<"atp" | "wta", FactorMatch[]>> {
  const out: Record<"atp" | "wta", FactorMatch[]> = { atp: [], wta: [] };
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await db
      .from("matches")
      .select(
        "tour, round, winner_side, result_detail, set_scores, pre_match_p1, player1_id, player2_id, player1_name, player2_name, player1_country, player2_country, tournament_id, tournaments!inner(start_date, surface, category, location)",
      )
      .eq("status", "final")
      .eq("confirmed", true)
      .in("winner_side", [1, 2])
      .order("id")
      .range(from, from + BATCH - 1);
    if (error) throw new Error(`factors: load: ${error.message}`);
    for (const r of (data ?? []) as unknown as Row[]) {
      if (!r.tournaments.start_date) continue;
      const sets = ((Array.isArray(r.set_scores) ? r.set_scores : []) as { p1: number | null; p2: number | null }[])
        .filter((x) => x.p1 !== null && x.p2 !== null)
        .map((x) => [x.p1!, x.p2!] as [number, number]);
      out[r.tour].push({
        key1: playerKey(r.player1_id, r.player1_name),
        key2: playerKey(r.player2_id, r.player2_name),
        winner: r.winner_side as 1 | 2,
        p1: r.pre_match_p1 ?? NaN,
        tournamentId: r.tournament_id,
        startDate: r.tournaments.start_date,
        surface: r.tournaments.surface,
        round: roundRank(r.round),
        country1: r.player1_country,
        country2: r.player2_country,
        host: hostCountry(r.tournaments.location),
        bestOf: r.tour === "atp" && /grand slam/i.test(r.tournaments.category ?? "") ? 5 : 3,
        sets,
        walkover: r.result_detail === "walkover",
      });
    }
    if (!data || data.length < BATCH) break;
  }
  return out;
}

/**
 * What moves a match beyond the ratings, per tour: each factor's effect in rating points (all
 * data) and whether it improves predictions on matches from 2023 on when fitted on earlier ones.
 * Stored in stat_cache as lab:factors. Weekly, with the lab.
 */
export async function computeFactors(db: AdminClient, now = new Date()) {
  const loaded = await loadMatches(db);
  const data: FactorsCache = { generated: now.toISOString(), from: FROM, holdoutFrom: HOLDOUT, tours: {} };
  for (const tour of ["atp", "wta"] as const) {
    const rows = factorRows(loaded[tour]).filter((r) => Number.isFinite(r.logit) && r.date >= FROM);
    const train = rows.filter((r) => r.date < HOLDOUT);
    const test = rows.filter((r) => r.date >= HOLDOUT);
    const none = FACTORS.map(() => false);
    const all = FACTORS.map(() => true);
    const fit = fitLogistic(rows);
    const baseFit = fitLogistic(train, none);
    const base = logLoss(test, baseFit, none);
    const differ = (r: FactorRow, i: number) => r.x[i] !== 0;
    data.tours[tour] = {
      matches: rows.length,
      slope: fit.beta[0],
      base,
      full: logLoss(test, fitLogistic(train, all), all),
      factors: FACTORS.map((f, i) => {
        const only = FACTORS.map((_, j) => j === i);
        const b = fit.beta[i + 1];
        const se = fit.se[i + 1];
        return {
          key: f.key,
          label: f.label,
          unit: f.unit,
          matches: rows.filter((r) => differ(r, i)).length,
          points: asRating(b),
          low: asRating(b - 1.96 * se),
          high: asRating(b + 1.96 * se),
          holdout: logLoss(test, fitLogistic(train, only), only) - base,
        };
      }),
    };
  }
  const { error } = await db.from("stat_cache").upsert({ key: "lab:factors", data: data as unknown as Json });
  if (error) throw new Error(`factors: ${error.message}`);
  return Object.fromEntries(Object.entries(data.tours).map(([t, v]) => [t, `${v.matches} matches`]));
}
