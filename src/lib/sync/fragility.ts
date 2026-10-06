import "server-only";

import { asRating, fitLogistic, logLoss, type FactorRow } from "@/lib/lab/factors";
import { fragility, shrunk, type FragilityMatch } from "@/lib/lab/fragility";
import { playerKey } from "@/lib/model/load";
import { matchScorelines, SCORELINE_PARAMS, type Scorelines } from "@/lib/scorelines";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

const BATCH = 1000;
const FROM = "2016-01-01";
const HOLDOUT = "2023-01-01";

export interface FragileRow {
  key: string;
  id: number | null;
  name: string;
  country: string | null;
  matches: number;
  deciders: number;
  expected: number;
  z: number;
  wins: number;
  expectedWins: number;
}

export interface FragilityCache {
  generated: string;
  since: string;
  tours: Record<
    string,
    {
      /** Correlation of players' fragility in 2016–2020 with 2021 on (50+ favoured matches in each). */
      persistence: { r: number; players: number };
      /** Fragility as a predictor of results: effect per unit (rating points, 95% interval) and holdout change in log loss. */
      effect: { points: number; low: number; high: number; holdout: number; matches: number };
      /** Players with 25+ favoured matches in the last two years (the pool the lists come from). */
      pool: number;
      fragile: FragileRow[];
      ruthless: FragileRow[];
    }
  >;
}

type Who = { id: number | null; name: string; country: string | null };

async function load(db: AdminClient): Promise<{ matches: Record<"atp" | "wta", FragilityMatch[]>; who: Map<string, Who> }> {
  const out: Record<"atp" | "wta", FragilityMatch[]> = { atp: [], wta: [] };
  const who = new Map<string, Who>();
  const cache = new Map<string, Scorelines>();
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await db
      .from("matches")
      .select("tour, winner_side, set_scores, pre_match_p1, player1_id, player2_id, player1_name, player2_name, player1_country, player2_country, tournaments!inner(start_date, category)")
      .eq("status", "final")
      .eq("confirmed", true)
      .in("winner_side", [1, 2])
      .is("result_detail", null)
      .not("pre_match_p1", "is", null)
      .gte("tournaments.start_date", FROM)
      .order("id")
      .range(from, from + BATCH - 1);
    if (error) throw new Error(`fragility: load: ${error.message}`);
    type R = {
      tour: "atp" | "wta";
      winner_side: number;
      set_scores: unknown;
      pre_match_p1: number;
      player1_id: number | null;
      player2_id: number | null;
      player1_name: string | null;
      player2_name: string | null;
      player1_country: string | null;
      player2_country: string | null;
      tournaments: { start_date: string; category: string | null };
    };
    for (const r of (data ?? []) as unknown as R[]) {
      const sets = ((Array.isArray(r.set_scores) ? r.set_scores : []) as { p1: number | null; p2: number | null }[]).filter((x) => x.p1 !== null && x.p2 !== null);
      const bestOf = r.tour === "atp" && /grand slam/i.test(r.tournaments.category ?? "") ? 5 : 3;
      const won1 = sets.filter((x) => x.p1! > x.p2!).length;
      if (Math.max(won1, sets.length - won1) !== Math.ceil(bestOf / 2)) continue;
      const p = Math.min(0.995, Math.max(0.005, Math.round(r.pre_match_p1 * 100) / 100));
      const k = `${r.tour}|${bestOf}|${p}`;
      let s = cache.get(k);
      if (!s) cache.set(k, (s = matchScorelines(p, bestOf, SCORELINE_PARAMS[r.tour])));
      const decider = s.sets.filter((o) => o.a + o.b === bestOf).reduce((t, o) => t + o.p, 0);
      const key1 = playerKey(r.player1_id, r.player1_name);
      const key2 = playerKey(r.player2_id, r.player2_name);
      who.set(key1, { id: r.player1_id, name: r.player1_name ?? key1, country: r.player1_country });
      who.set(key2, { id: r.player2_id, name: r.player2_name ?? key2, country: r.player2_country });
      out[r.tour].push({ key1, key2, date: r.tournaments.start_date, p1: r.pre_match_p1, decider, wentDistance: sets.length === bestOf, winner: r.winner_side as 1 | 2 });
    }
    if (!data || data.length < BATCH) break;
  }
  return { matches: out, who };
}

const correlation = (xs: number[], ys: number[]) => {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
};

/**
 * Fragile and ruthless favourites, whether fragility is a lasting trait, and whether it predicts
 * results beyond the ratings. Stored in stat_cache as lab:fragility. Weekly, with the factors.
 */
export async function computeFragility(db: AdminClient, now = new Date()) {
  const { matches, who } = await load(db);
  const since = new Date(now.getTime() - 730 * 86_400_000).toISOString().slice(0, 10);
  const data: FragilityCache = { generated: now.toISOString(), since, tours: {} };
  for (const tour of ["atp", "wta"] as const) {
    const all = matches[tour];

    // Is it a trait? Early period against late period, for players with enough favoured matches in both.
    const early = fragility(all.filter((m) => m.date < "2021-01-01"));
    const late = fragility(all.filter((m) => m.date >= "2021-01-01"));
    const both = [...early.values()].filter((f) => f.matches >= 50 && (late.get(f.key)?.matches ?? 0) >= 50);
    const persistence = { r: correlation(both.map((f) => f.z / Math.sqrt(f.matches)), both.map((f) => late.get(f.key)!.z / Math.sqrt(late.get(f.key)!.matches))), players: both.length };

    // Does it predict results? Each season scored with fragility from earlier seasons only.
    const rows: FactorRow[] = [];
    for (let y = 2019; y <= now.getUTCFullYear(); y++) {
      const past = fragility(all, `${y}-01-01`);
      for (const m of all) {
        if (!m.date.startsWith(String(y)) || m.p1 <= 0 || m.p1 >= 1) continue;
        rows.push({ logit: Math.log(m.p1 / (1 - m.p1)), x: [shrunk(past.get(m.key1)) - shrunk(past.get(m.key2))], y: m.winner === 1 ? 1 : 0, date: m.date });
      }
    }
    const use = [true];
    const train = rows.filter((r) => r.date < HOLDOUT);
    const test = rows.filter((r) => r.date >= HOLDOUT);
    const fit = fitLogistic(train, use);
    const base = fitLogistic(train, [false]);
    const effect = {
      points: asRating(fit.beta[1]),
      low: asRating(fit.beta[1] - 1.96 * fit.se[1]),
      high: asRating(fit.beta[1] + 1.96 * fit.se[1]),
      holdout: logLoss(test, fit, use) - logLoss(test, base, [false]),
      matches: rows.length,
    };

    // The last two years: who lets favoured matches drift, and who closes them out.
    const recent = [...fragility(all.filter((m) => m.date >= since)).values()].filter((f) => f.matches >= 25);
    const row = (f: (typeof recent)[number]): FragileRow => {
      const w = who.get(f.key);
      return { key: f.key, id: w?.id ?? null, name: w?.name ?? f.key, country: w?.country ?? null, matches: f.matches, deciders: f.deciders, expected: f.expected, z: f.z, wins: f.wins, expectedWins: f.expectedWins };
    };
    data.tours[tour] = {
      persistence,
      effect,
      pool: recent.length,
      fragile: [...recent].sort((a, b) => b.z - a.z).slice(0, 12).map(row),
      ruthless: [...recent].sort((a, b) => a.z - b.z).slice(0, 12).map(row),
    };
  }
  const { error } = await db.from("stat_cache").upsert({ key: "lab:fragility", data: data as unknown as Json });
  if (error) throw new Error(`fragility: ${error.message}`);
  return Object.fromEntries(Object.entries(data.tours).map(([t, v]) => [t, `r=${v.persistence.r.toFixed(2)}, effect ${v.effect.points.toFixed(1)}`]));
}
