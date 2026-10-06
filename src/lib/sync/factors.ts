import "server-only";

import { comebackCurves, findReturns, GAP_BUCKETS, ratingShift, type ComebackMatch, type CurvePoint } from "@/lib/lab/comebacks";
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
  player1_country: string | null;
  player2_country: string | null;
  tournament_id: number;
  tournaments: { start_date: string | null; surface: string | null; category: string | null; location: string | null };
};

export interface ComebackPlayer {
  key: string;
  id: number | null;
  name: string;
  country: string | null;
  date: string;
  weeks: number;
  /** Events played since the return, and the rating shift over them. */
  events: number;
  shift: number;
  matches: number;
}

export interface ComebacksCache {
  generated: string;
  tours: Record<string, { returns: Record<string, number>; curves: Record<string, CurvePoint[]>; current: ComebackPlayer[]; best: ComebackPlayer[] }>;
}

type Who = { id: number | null; name: string; country: string | null };

export async function loadMatches(db: AdminClient): Promise<{ matches: Record<"atp" | "wta", FactorMatch[]>; who: Map<string, Who> }> {
  const out: Record<"atp" | "wta", FactorMatch[]> = { atp: [], wta: [] };
  const who = new Map<string, Who>();
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await db
      .from("matches")
      .select(
        "id, tour, round, winner_side, result_detail, set_scores, pre_match_p1, player1_id, player2_id, player1_name, player2_name, player1_country, player2_country, tournament_id, tournaments!inner(start_date, surface, category, location)",
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
      const key1 = playerKey(r.player1_id, r.player1_name);
      const key2 = playerKey(r.player2_id, r.player2_name);
      who.set(key1, { id: r.player1_id, name: r.player1_name ?? key1, country: r.player1_country });
      who.set(key2, { id: r.player2_id, name: r.player2_name ?? key2, country: r.player2_country });
      out[r.tour].push({
        id: r.id,
        key1,
        key2,
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
        retired: r.result_detail === "retired",
      });
    }
    if (!data || data.length < BATCH) break;
  }
  return { matches: out, who };
}

/**
 * What moves a match beyond the ratings, per tour: each factor's effect in rating points (all
 * data) and whether it improves predictions on matches from 2023 on when fitted on earlier ones.
 * Stored in stat_cache as lab:factors. Weekly, with the lab.
 */
export async function computeFactors(db: AdminClient, now = new Date()) {
  const { matches: loaded, who } = await loadMatches(db);
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

  // Comeback curves, from the same matches.
  const today = now.toISOString().slice(0, 10);
  const comebacks: ComebacksCache = { generated: now.toISOString(), tours: {} };
  for (const tour of ["atp", "wta"] as const) {
    const per: ComebackMatch[] = loaded[tour]
      .filter((m) => !m.walkover && Number.isFinite(m.p1))
      .flatMap((m) => [
        { key: m.key1, tournamentId: m.tournamentId, startDate: m.startDate, p: m.p1, won: m.winner === 1 },
        { key: m.key2, tournamentId: m.tournamentId, startDate: m.startDate, p: 1 - m.p1, won: m.winner === 2 },
      ]);
    const returns = findReturns(per).filter((r) => r.date >= FROM);
    const player = (r: (typeof returns)[number], upTo: number): ComebackPlayer => {
      const ms = r.events.slice(0, upTo).flat();
      const w = who.get(r.key);
      // Shrunk toward no change (prior sd 150 points): a few matches can't say much.
      return { key: r.key, id: w?.id ?? null, name: w?.name ?? r.key, country: w?.country ?? null, date: r.date, weeks: Math.round(r.gap / 7), events: Math.min(upTo, r.events.length), shift: ratingShift(ms, 150).shift, matches: ms.length };
    };
    const recent = new Date(now.getTime() - 120 * 86_400_000).toISOString().slice(0, 10);
    comebacks.tours[tour] = {
      returns: Object.fromEntries(GAP_BUCKETS.map((b) => [b.key, returns.filter((r) => r.gap >= b.min && r.gap < b.max).length])),
      curves: comebackCurves(returns),
      // Back within the last four months, best known first.
      current: returns
        .filter((r) => r.date >= recent && r.date <= today && who.get(r.key)?.id)
        .map((r) => player(r, 6))
        .sort((a, b) => b.weeks - a.weeks)
        .slice(0, 20),
      // The strongest returns from half a year or more away: first three events, 6+ matches.
      best: returns
        .filter((r) => r.gap >= 182)
        .map((r) => player(r, 3))
        .filter((p) => p.matches >= 6)
        .sort((a, b) => b.shift - a.shift)
        .slice(0, 12),
    };
  }
  const { error: cErr } = await db.from("stat_cache").upsert({ key: "lab:comebacks", data: comebacks as unknown as Json });
  if (cErr) throw new Error(`comebacks: ${cErr.message}`);
  return Object.fromEntries(Object.entries(data.tours).map(([t, v]) => [t, `${v.matches} matches`]));
}
