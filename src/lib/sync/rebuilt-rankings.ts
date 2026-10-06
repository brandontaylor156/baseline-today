import "server-only";

import { getSeasonMatches } from "@/lib/data/season";
import { countsForRace, defaultDrawSize } from "@/lib/points";
import type { Tour } from "@/lib/provider/types";
import { eventPoints, roundsFor, type RaceEvent } from "@/lib/race";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { latestRevisions } from "@/lib/wiki/client";
import { finalsPoints } from "@/lib/wiki/finals";
import { normalizeName } from "@/lib/wiki/names";

const FIRST = 2015;
/** Results that count: a player's best 19 (ATP) or 18 (WTA) of the last 52 weeks. */
export const BEST: Record<Tour, number> = { atp: 19, wta: 18 };

export interface No1Stint {
  from: string;
  to: string;
  key: string;
  id: number | null;
  name: string;
  weeks: number;
}

export interface RebuiltCache {
  generated: string;
  /** Against the official rankings we hold: share of the top 10 matched, rank correlation of the top 100, typical points gap of the top 20. */
  accuracy: Record<string, { dates: number; top10: number; spearman: number; pointsGap: number; no1: number }>;
  no1: Record<string, No1Stint[]>;
}

const mondays = (from: string, to: string) => {
  const out: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 7 * 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
};

function spearman(a: number[], b: number[]) {
  const n = a.length;
  if (n < 3) return 0;
  const rank = (xs: number[]) => {
    const order = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
    const r = new Array<number>(n);
    order.forEach(([, i], k) => (r[i] = k + 1));
    return r;
  };
  const ra = rank(a);
  const rb = rank(b);
  const d2 = ra.reduce((s, x, i) => s + (x - rb[i]) ** 2, 0);
  return 1 - (6 * d2) / (n * (n * n - 1));
}

/**
 * Every player's points from every tracked event since 2015 (our points table), stored for the
 * rebuilt rankings; then each Monday's rebuilt No. 1 since 2016 and a check against the official
 * rankings we hold. Weekly (Fridays), incrementally; `full` rebuilds every season.
 */
export async function computeRebuiltRankings(db: AdminClient, now = new Date(), full = false) {
  const today = now.toISOString().slice(0, 10);
  const data: RebuiltCache = { generated: now.toISOString(), accuracy: {}, no1: {} };
  // Weekly runs redo the last two seasons and extend the No. 1 history; `full` redoes everything.
  const { data: old } = await db.from("stat_cache").select("data").eq("key", "rankings:rebuilt").maybeSingle();
  const previous = full ? undefined : (old?.data as unknown as RebuiltCache | undefined);
  for (const tour of ["atp", "wta"] as const) {
    for (let season = previous ? now.getUTCFullYear() - 1 : FIRST; season <= now.getUTCFullYear(); season++) {
      const { data: ts, error } = await db
        .from("tournaments")
        .select("id, name, category, draw_size, end_date, start_date")
        .eq("tour", tour)
        .eq("season", season)
        .eq("provider", "balldontlie");
      if (error) throw new Error(`rebuilt rankings: tournaments: ${error.message}`);
      // Wimbledon 2022 awarded no ranking points.
      const counted = (ts ?? []).filter((t) => countsForRace(tour, t.category) && t.end_date && t.end_date <= today && !(season === 2022 && /wimbledon/i.test(t.name)));
      const events = new Map<number, RaceEvent>(counted.map((t) => [t.id, { tour, category: t.category, rounds: roundsFor(t.draw_size ?? defaultDrawSize(t.category)) }]));
      const meta = new Map(counted.map((t) => [t.id, t]));
      const matches = await getSeasonMatches(tour, season);
      const who = new Map<string, { id: number | null; name: string; country: string | null }>();
      for (const m of matches) for (const p of [m.p1, m.p2]) who.set(p.key, { id: p.id, name: p.name, country: p.country });
      const rows = [...eventPoints(matches, events)].flatMap(([key, byEvent]) =>
        [...byEvent].map(([tid, points]) => ({
          tour,
          tournament_id: tid,
          player_key: key,
          player_id: who.get(key)?.id ?? null,
          name: who.get(key)?.name ?? key,
          country: who.get(key)?.country ?? null,
          category: meta.get(tid)!.category!,
          end_date: meta.get(tid)!.end_date!,
          points,
        })),
      );
      // The season finals, from Wikipedia (our results don't hold round-robin matches).
      const finalsRow = (ts ?? []).find((t) => /finals/i.test(t.category ?? "") && /finals/i.test(t.name));
      const finalsEnd = finalsRow?.end_date ?? `${season}-11-20`;
      if (finalsEnd <= today) {
        const title = `${season} ${tour.toUpperCase()} Finals – Singles`;
        const page = (await latestRevisions([title]).catch(() => new Map<string, { content: string }>())).get(title);
        const byName = new Map([...who].map(([key, w]) => [normalizeName(w.name), key]));
        for (const [name, points] of finalsPoints(page?.content ?? "")) {
          const key = byName.get(normalizeName(name));
          if (!key) continue;
          const w = who.get(key)!;
          rows.push({ tour, tournament_id: finalsRow?.id ?? -season, player_key: key, player_id: w.id, name: w.name, country: w.country, category: `${tour.toUpperCase()} Finals`, end_date: finalsEnd, points });
        }
      }
      for (let i = 0; i < rows.length; i += 1000) {
        const { error: e } = await db.from("ranking_points").upsert(rows.slice(i, i + 1000), { onConflict: "tournament_id,player_key" });
        if (e) throw new Error(`rebuilt rankings: save: ${e.message}`);
      }
    }

    // Each Monday's rebuilt No. 1 since 2016, as stints.
    // Recent weeks can change as late results arrive: keep stints before the last eight weeks, redo the rest.
    const redoFrom = new Date(now.getTime() - 56 * 86_400_000).toISOString().slice(0, 10);
    const kept = (previous?.no1[tour] ?? []).filter((s) => s.to < redoFrom);
    const stints: No1Stint[] = kept.map((s) => ({ ...s }));
    const start = kept.length ? new Date(Date.parse(`${kept.at(-1)!.to}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10) : "2016-01-04";
    for (const week of mondays(start, today)) {
      const { data: top } = await db.rpc("rebuilt_ranking", { p_tour: tour, p_date: week, p_best: BEST[tour], p_limit: 1 });
      const t = top?.[0];
      if (!t) continue;
      const last = stints.at(-1);
      if (last && last.key === t.player_key) {
        last.to = week;
        last.weeks++;
      } else stints.push({ from: week, to: week, key: t.player_key, id: t.player_id, name: t.name, weeks: 1 });
    }
    data.no1[tour] = stints;

    // Check against the official rankings we hold (every fourth date).
    const { data: dates } = await db.rpc("ranking_dates", { p_tour: tour });
    const checks = ((dates ?? []) as string[]).filter((_, i) => i % 4 === 0);
    let top10 = 0;
    let rho = 0;
    let gap = 0;
    let no1 = 0;
    for (const d of checks) {
      const [{ data: official }, { data: rebuilt }] = await Promise.all([
        db.from("rankings").select("player_id, rank, points").eq("tour", tour).eq("ranking_date", d).order("rank").limit(100),
        db.rpc("rebuilt_ranking", { p_tour: tour, p_date: d, p_best: BEST[tour], p_limit: 150 }),
      ]);
      const ours = new Map((rebuilt ?? []).filter((r) => r.player_id !== null).map((r) => [r.player_id!, r]));
      const off = official ?? [];
      const offTop10 = new Set(off.slice(0, 10).map((r) => r.player_id));
      top10 += (rebuilt ?? []).slice(0, 10).filter((r) => r.player_id !== null && offTop10.has(r.player_id)).length / 10;
      no1 += off[0] && rebuilt?.[0]?.player_id === off[0].player_id ? 1 : 0;
      const both = off.filter((r) => ours.has(r.player_id));
      rho += spearman(both.map((r) => r.rank), both.map((r) => ours.get(r.player_id)!.rank));
      const gaps = off
        .slice(0, 20)
        .filter((r) => ours.has(r.player_id) && r.points)
        .map((r) => Math.abs(ours.get(r.player_id)!.points - r.points!) / r.points!)
        .sort((a, b) => a - b);
      gap += gaps[Math.floor(gaps.length / 2)] ?? 0;
    }
    const n = Math.max(1, checks.length);
    data.accuracy[tour] = { dates: checks.length, top10: top10 / n, spearman: rho / n, pointsGap: gap / n, no1: no1 / n };
  }
  const { error } = await db.from("stat_cache").upsert({ key: "rankings:rebuilt", data: data as unknown as Json });
  if (error) throw new Error(`rebuilt rankings: ${error.message}`);
  return Object.fromEntries(Object.entries(data.accuracy).map(([t, a]) => [t, `top10 ${(a.top10 * 100).toFixed(0)}%, rho ${a.spearman.toFixed(2)}, gap ${(a.pointsGap * 100).toFixed(0)}%`]));
}
