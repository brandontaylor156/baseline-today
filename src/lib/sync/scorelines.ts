import "server-only";

import { serveModelFor } from "@/lib/live-prob";
import { formNodes, mixScorelines, SCORELINE_PARAMS, scorelines, type Scorelines } from "@/lib/scorelines";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

const BATCH = 1000;
const FROM = "2016-01-01";
// Tour-average serve-point rates to try: they set how often sets reach tiebreaks and how long matches run.
const AVERAGES = [0.54, 0.56, 0.58, 0.6, 0.62, 0.64, 0.66, 0.68];
// Match-day form spreads to try (log-odds scale).
const TAUS = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5];

interface Done {
  p1: number;
  bestOf: 3 | 5;
  /** Sets won by player 1 and 2, games, and whether any set went to a tiebreak. */
  s1: number;
  s2: number;
  games: number;
  tiebreak: boolean;
}

export interface Reliability {
  predicted: number;
  actual: number;
  matches: number;
}

export interface ScorelineCheck {
  matches: number;
  average: number;
  /** Match-day form spread chosen (log-odds), and the set-score log loss without it. */
  tau: number;
  flatLogLoss: number;
  spreads: { tau: number; logLoss: number }[];
  /** Log loss of the exact match score in sets: model, and tour frequencies alone. */
  logLoss: number;
  baseline: number;
  /** How often the most likely set score was the actual one. */
  topHit: number;
  straight: Reliability[];
  tiebreak: Reliability[];
  /** Predicted vs actual mean games by bin of predicted mean. */
  games: Reliability[];
  /** By serve average tried (at the chosen spread): tiebreak log loss, tiebreak rate and mean games. */
  tuning: { average: number; logLoss: number; tiebreak: number; games: number }[];
  actualTiebreak: number;
  actualGames: number;
}

export interface ScorelinesCache {
  generated: string;
  tours: Record<string, ScorelineCheck>;
}

async function load(db: AdminClient): Promise<Record<"atp" | "wta", Done[]>> {
  const out: Record<"atp" | "wta", Done[]> = { atp: [], wta: [] };
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await db
      .from("matches")
      .select("tour, winner_side, result_detail, set_scores, pre_match_p1, tournaments!inner(start_date, category)")
      .eq("status", "final")
      .eq("confirmed", true)
      .in("winner_side", [1, 2])
      .is("result_detail", null)
      .not("pre_match_p1", "is", null)
      .gte("tournaments.start_date", FROM)
      .order("id")
      .range(from, from + BATCH - 1);
    if (error) throw new Error(`scorelines: load: ${error.message}`);
    for (const r of (data ?? []) as unknown as { tour: "atp" | "wta"; winner_side: number; set_scores: unknown; pre_match_p1: number; tournaments: { category: string | null } }[]) {
      const sets = ((Array.isArray(r.set_scores) ? r.set_scores : []) as { p1: number | null; p2: number | null }[]).filter((x) => x.p1 !== null && x.p2 !== null);
      const bestOf = r.tour === "atp" && /grand slam/i.test(r.tournaments.category ?? "") ? 5 : 3;
      const s1 = sets.filter((x) => x.p1! > x.p2!).length;
      const s2 = sets.length - s1;
      const need = Math.ceil(bestOf / 2);
      // Only regular scorelines (a completed match, no match tiebreak in place of a set).
      if (Math.max(s1, s2) !== need || sets.some((x) => Math.max(x.p1!, x.p2!) > 7 || (Math.max(x.p1!, x.p2!) < 6 && Math.max(x.p1!, x.p2!) !== 0))) continue;
      if ((s1 === need) !== (r.winner_side === 1)) continue;
      out[r.tour].push({
        p1: r.pre_match_p1,
        bestOf,
        s1,
        s2,
        games: sets.reduce((t, x) => t + x.p1! + x.p2!, 0),
        tiebreak: sets.some((x) => x.p1! + x.p2! === 13),
      });
    }
    if (!data || data.length < BATCH) break;
  }
  return out;
}

/** Bins of a predicted probability (or value) against what happened. */
function reliability(pairs: [number, number][], edges: number[]): Reliability[] {
  return edges.slice(0, -1).flatMap((lo, i) => {
    const hi = edges[i + 1];
    const xs = pairs.filter(([p]) => p >= lo && (i === edges.length - 2 ? p <= hi : p < hi));
    if (xs.length < 30) return [];
    return [{ predicted: xs.reduce((s, [p]) => s + p, 0) / xs.length, actual: xs.reduce((s, [, a]) => s + a, 0) / xs.length, matches: xs.length }];
  });
}

/** Scorelines for a pre-match chance with match-day form, from cached single-chance scorelines. */
function linesFor(cache: Map<string, Scorelines>, average: number, tau: number, p: number, bestOf: 3 | 5): Scorelines {
  const one = (q: number) => {
    const r = Math.min(0.995, Math.max(0.005, Math.round(q * 200) / 200));
    const k = `${average}|${bestOf}|${r}`;
    let v = cache.get(k);
    if (!v) cache.set(k, (v = scorelines(serveModelFor(r, bestOf, average))));
    return v;
  };
  return mixScorelines(formNodes(Math.min(0.995, Math.max(0.005, p)), tau).map((n) => ({ s: one(n.p), w: n.w })));
}

function check(done: Done[], average: number, tau: number, cache: Map<string, Scorelines>) {
  let ll = 0;
  let tbLoss = 0;
  let hits = 0;
  let tb = 0;
  let games = 0;
  const straight: [number, number][] = [];
  const tiebreak: [number, number][] = [];
  const meanGames: [number, number][] = [];
  for (const d of done) {
    const s = linesFor(cache, average, tau, d.p1, d.bestOf);
    const p = s.sets.find((o) => o.a === d.s1 && o.b === d.s2)?.p ?? 1e-6;
    ll -= Math.log(Math.max(1e-6, p));
    if (s.sets[0].a === d.s1 && s.sets[0].b === d.s2) hits++;
    straight.push([s.sets.filter((o) => Math.min(o.a, o.b) === 0).reduce((t, o) => t + o.p, 0), d.s1 === 0 || d.s2 === 0 ? 1 : 0]);
    tiebreak.push([s.tiebreak, d.tiebreak ? 1 : 0]);
    tbLoss -= Math.log(Math.max(1e-6, d.tiebreak ? s.tiebreak : 1 - s.tiebreak));
    meanGames.push([s.meanGames, d.games]);
    tb += s.tiebreak;
    games += s.meanGames;
  }
  const n = Math.max(1, done.length);
  return { logLoss: ll / n, tbLoss: tbLoss / n, topHit: hits / n, tiebreak: tb / n, games: games / n, straight, tiebreakPairs: tiebreak, meanGames };
}

/**
 * How well the serve model's scoreline probabilities match real results, per tour. With `tune`,
 * also searches the form spread and serve average (minutes; run by hand and copy the winners into
 * SCORELINE_PARAMS). Stored in stat_cache as lab:scorelines.
 */
export async function computeScorelines(db: AdminClient, now = new Date(), tune = false) {
  const all = await load(db);
  const data: ScorelinesCache = { generated: now.toISOString(), tours: {} };
  for (const tour of ["atp", "wta"] as const) {
    const done = all[tour];
    const cache = new Map<string, Scorelines>();
    // Form spread first (it shapes set scores; the serve average barely does), then the serve
    // average for tiebreaks given that spread.
    // The weekly check re-scores the tuned values (and no form, for comparison); `tune` searches the grids.
    const fixed = SCORELINE_PARAMS[tour];
    const spreads = (tune ? TAUS : [0, fixed.tau]).map((tau) => ({ tau, ...check(done, tune ? 0.6 : fixed.average, tau, cache) }));
    const bestTau = spreads.reduce((b, t) => (t.logLoss < b.logLoss ? t : b), spreads[0]).tau;
    const tuning = (tune ? AVERAGES : [fixed.average]).map((average) => {
      const r = check(done, average, bestTau, cache);
      return { average, logLoss: r.tbLoss, tiebreak: r.tiebreak, games: r.games };
    });
    const best = tuning.reduce((b, t) => (t.logLoss < b.logLoss ? t : b), tuning[0]);
    const c = check(done, best.average, bestTau, cache);
    const flat = check(done, best.average, 0, cache);
    // Baseline: the tour's frequency of each set score from the winner's side, mirrored for the favourite.
    const freq = new Map<string, number>();
    for (const d of done) freq.set(`${d.bestOf}|${d.s1}-${d.s2}`, (freq.get(`${d.bestOf}|${d.s1}-${d.s2}`) ?? 0) + 1);
    const total = (bo: number) => done.filter((d) => d.bestOf === bo).length;
    const baseline = done.reduce((s, d) => s - Math.log((freq.get(`${d.bestOf}|${d.s1}-${d.s2}`) ?? 1) / total(d.bestOf)), 0) / Math.max(1, done.length);
    data.tours[tour] = {
      matches: done.length,
      average: best.average,
      tau: bestTau,
      flatLogLoss: flat.logLoss,
      spreads: spreads.map((x) => ({ tau: x.tau, logLoss: x.logLoss })),
      logLoss: c.logLoss,
      baseline,
      topHit: c.topHit,
      straight: reliability(c.straight, [0, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1]),
      tiebreak: reliability(c.tiebreakPairs, [0, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5, 1]),
      games: reliability(c.meanGames, [0, 19, 20, 21, 22, 23, 24, 26, 30, 40, 60]),
      tuning,
      actualTiebreak: done.filter((d) => d.tiebreak).length / Math.max(1, done.length),
      actualGames: done.reduce((s, d) => s + d.games, 0) / Math.max(1, done.length),
    };
  }
  const { error } = await db.from("stat_cache").upsert({ key: "lab:scorelines", data: data as unknown as Json });
  if (error) throw new Error(`scorelines: ${error.message}`);
  return Object.fromEntries(Object.entries(data.tours).map(([t, v]) => [t, `${v.matches} matches, serve average ${v.average}, form ${v.tau}`]));
}
