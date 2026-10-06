import "server-only";

import { fitPace, tiebreakExcess, type PaceMatch } from "@/lib/lab/pace";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

const BATCH = 1000;
const FROM = "2016-01-01";

export interface PaceEvent {
  tournamentId: number;
  providerId: number | null;
  name: string;
  season: number;
  surface: string | null;
  category: string | null;
  /** Serve-point rate that fits the event's scorelines, and its gap to the tour (percentage points). */
  rate: number;
  delta: number;
  /** Tiebreaks played minus expected, in percentage points of sets (shrunk toward zero for small events). */
  tiebreaks: number;
  sets: number;
}

export interface PaceCache {
  generated: string;
  tours: Record<
    string,
    {
      rate: number;
      surfaces: { surface: string; delta: number; tiebreaks: number; events: number }[];
      /** Correlation of an event's pace with its previous edition (same event, consecutive years), for the rate and the tiebreak index. */
      persistence: { r: number; pairs: number };
      tiebreakPersistence: { r: number; pairs: number };
      events: PaceEvent[];
    }
  >;
}

const correlation = (xs: number[], ys: number[]) => {
  const n = xs.length;
  if (n < 3) return 0;
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
 * Court pace for every event since 2016 from its scorelines: the serve-point rate that best explains
 * the set scores given each match's pre-match chance. Stored in stat_cache as lab:pace. Weekly.
 */
export async function computePace(db: AdminClient, now = new Date()) {
  type T = { id: number; provider_id: number | null; name: string; season: number; surface: string | null; category: string | null };
  const byEvent = new Map<number, { t: T; tour: "atp" | "wta"; matches: PaceMatch[] }>();
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await db
      .from("matches")
      .select("tour, set_scores, pre_match_p1, tournament_id, tournaments!inner(id, provider_id, name, season, surface, category, start_date)")
      .eq("status", "final")
      .eq("confirmed", true)
      .in("winner_side", [1, 2])
      .is("result_detail", null)
      .not("pre_match_p1", "is", null)
      .gte("tournaments.start_date", FROM)
      .order("id")
      .range(from, from + BATCH - 1);
    if (error) throw new Error(`pace: load: ${error.message}`);
    for (const r of (data ?? []) as unknown as { tour: "atp" | "wta"; set_scores: unknown; pre_match_p1: number; tournament_id: number; tournaments: T }[]) {
      const sets = ((Array.isArray(r.set_scores) ? r.set_scores : []) as { p1: number | null; p2: number | null }[])
        .filter((x) => x.p1 !== null && x.p2 !== null)
        .map((x) => [x.p1!, x.p2!] as [number, number])
        // Regular sets only (no match tiebreak played instead of a final set).
        .filter(([a, b]) => Math.max(a, b) >= 6 && Math.max(a, b) <= 7);
      if (sets.length < 2) continue;
      const bestOf = r.tour === "atp" && /grand slam/i.test(r.tournaments.category ?? "") ? 5 : 3;
      const e = byEvent.get(r.tournament_id) ?? { t: r.tournaments, tour: r.tour, matches: [] };
      e.matches.push({ p1: r.pre_match_p1, bestOf, sets });
      byEvent.set(r.tournament_id, e);
    }
    if (!data || data.length < BATCH) break;
  }

  const data: PaceCache = { generated: now.toISOString(), tours: {} };
  for (const tour of ["atp", "wta"] as const) {
    const events = [...byEvent.values()].filter((e) => e.tour === tour && e.matches.length >= 8);
    // The tour's own rate (a wide prior), then each event against it.
    const all = events.flatMap((e) => e.matches);
    const sample = all.filter((_, i) => i % 5 === 0);
    const rate = fitPace(sample, 0.6, 0.2).rate;
    const out: PaceEvent[] = events.map((e) => {
      const f = fitPace(e.matches, rate);
      const tb = tiebreakExcess(e.matches, rate);
      return {
        tournamentId: e.t.id,
        providerId: e.t.provider_id,
        name: e.t.name,
        season: e.t.season,
        surface: e.t.surface,
        category: e.t.category,
        rate: f.rate,
        delta: Math.round((f.rate - rate) * 1000) / 10,
        tiebreaks: Math.round(((tb.excess * tb.sets) / (tb.sets + 60)) * 10) / 10,
        sets: f.sets,
      };
    });
    const surfaces = ["Hard", "Clay", "Grass"].map((s) => {
      const xs = out.filter((e) => (e.surface ?? "").toLowerCase().includes(s.toLowerCase()));
      const mean = (f: (e: PaceEvent) => number) => (xs.length ? Math.round((xs.reduce((a, e) => a + f(e), 0) / xs.length) * 10) / 10 : 0);
      return { surface: s, delta: mean((e) => e.delta), tiebreaks: mean((e) => e.tiebreaks), events: xs.length };
    });
    const bySeries = new Map(out.filter((e) => e.providerId !== null).map((e) => [`${e.providerId}|${e.season}`, e]));
    const pairs = out.flatMap((e) => {
      const prev = bySeries.get(`${e.providerId}|${e.season - 1}`);
      return e.providerId !== null && prev ? [[prev.delta, e.delta] as const] : [];
    });
    const tbPairs = out.flatMap((e) => {
      const prev = bySeries.get(`${e.providerId}|${e.season - 1}`);
      return e.providerId !== null && prev ? [[prev.tiebreaks, e.tiebreaks] as const] : [];
    });
    data.tours[tour] = {
      rate,
      surfaces,
      persistence: { r: correlation(pairs.map((p) => p[0]), pairs.map((p) => p[1])), pairs: pairs.length },
      tiebreakPersistence: { r: correlation(tbPairs.map((p) => p[0]), tbPairs.map((p) => p[1])), pairs: tbPairs.length },
      events: out.sort((a, b) => b.season - a.season || b.delta - a.delta),
    };
  }
  const { error } = await db.from("stat_cache").upsert({ key: "lab:pace", data: data as unknown as Json });
  if (error) throw new Error(`pace: ${error.message}`);
  return Object.fromEntries(
    Object.entries(data.tours).map(([t, v]) => [t, `rate ${v.rate}, ${v.events.length} events, persistence r=${v.persistence.r.toFixed(2)} tb r=${v.tiebreakPersistence.r.toFixed(2)}, ${v.surfaces.map((s) => `${s.surface} ${s.delta}/${s.tiebreaks}`).join(" ")}`]),
  );
}
