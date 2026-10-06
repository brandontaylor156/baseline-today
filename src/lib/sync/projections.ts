import "server-only";

import { backtest, fieldLevels, project, type Backtest, type Band, type Series } from "@/lib/lab/comparables";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

const PAGE = 1000;
const round = (x: number) => Math.round(x * 10) / 10;

export interface ProjectionComp {
  key: string;
  id: number | null;
  name: string;
  country: string | null;
  /** The season they were this age. */
  season: number;
  then: number;
  plus1: number | null;
  plus2: number | null;
}

export interface ProjectionRow {
  key: string;
  id: number | null;
  name: string;
  country: string | null;
  age: number;
  rating: number;
  rel: number;
  path: (number | null)[];
  in1: Band | null;
  in2: Band | null;
  /** Share of the comps rated higher (against the field) a year later. */
  rose: number;
  comps: ProjectionComp[];
}

export interface ProjectionsCache {
  generated: string;
  asOf: string;
  /** The field's level (rating) this season: the 100 best season averages. */
  level: number;
  backtests: Backtest[];
  players: ProjectionRow[];
}

async function pages<T>(fetch: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, label: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await fetch(from, from + PAGE - 1);
    if (error) throw new Error(`projections: ${label}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/**
 * Career comparables for every active player with two years of history (weekly, after the lab
 * rebuilds ratings), plus backtests from earlier seasons. Stored in stat_cache as projections:<tour>.
 */
export async function computeProjections(db: AdminClient, now = new Date()) {
  const out: Record<string, string> = {};
  for (const tour of ["atp", "wta"] as const) {
    const [weeks, births, people, players] = await Promise.all([
      pages((f, to) => db.from("lab_ratings").select("player_key, week, overall").eq("tour", tour).order("player_key").order("week").range(f, to), "ratings"),
      pages((f, to) => db.rpc("lab_birth_dates", { p_tour: tour }).order("player_key").range(f, to), "births"),
      pages((f, to) => db.from("lab_people").select("player_key, name, country").eq("tour", tour).order("player_key").range(f, to), "people"),
      pages((f, to) => db.from("players").select("id, full_name, country_code").eq("tour", tour).order("id").range(f, to), "players"),
    ]);
    const birth = new Map(births.map((b) => [b.player_key, b.birth_date]));
    const byKey = new Map<string, Series>();
    for (const w of weeks) {
      const b = birth.get(w.player_key);
      if (!b) continue;
      if (!byKey.has(w.player_key)) byKey.set(w.player_key, { key: w.player_key, birth: b, weeks: [] });
      byKey.get(w.player_key)!.weeks.push({ week: w.week, overall: w.overall });
    }
    const series = [...byKey.values()];
    const field = fieldLevels(series);
    const asOf = weeks.reduce((m, w) => (w.week > m ? w.week : m), "");

    const linked = new Map(players.map((p) => [`id:${p.id}`, p]));
    const named = new Map(people.map((p) => [p.player_key, p]));
    const who = (key: string) => {
      const p = linked.get(key);
      const n = named.get(key);
      return { id: p?.id ?? null, name: p?.full_name ?? n?.name ?? key.replace(/^name:/, ""), country: p?.country_code ?? n?.country ?? null };
    };

    const rows: ProjectionRow[] = [];
    for (const s of series) {
      const p = project(s, series, field, asOf);
      if (!p || !p.in1 || p.age > 34) continue;
      rows.push({
        key: s.key,
        ...who(s.key),
        age: round(p.age),
        rating: Math.round(p.rating),
        rel: round(p.rel),
        path: p.path.map((x) => (x === null ? null : round(x))),
        in1: p.in1,
        in2: p.in2,
        rose: Math.round((p.comps.filter((c) => c.plus1! > c.then).length / p.comps.length) * 100) / 100,
        comps: p.comps.slice(0, 10).map((c) => {
          const b = byKey.get(c.key)!.birth;
          return { key: c.key, ...who(c.key), season: Number(b.slice(0, 4)) + Math.floor(p.age + Number(b.slice(5, 7)) / 12), then: round(c.then), plus1: c.plus1 === null ? null : round(c.plus1), plus2: c.plus2 === null ? null : round(c.plus2) };
        }),
      });
    }
    rows.sort((a, b) => b.rating - a.rating);
    const top = rows.slice(0, 200).map((r) => ({ ...r, in1: r.in1 && bandRound(r.in1), in2: r.in2 && bandRound(r.in2) }));

    const backtests = ["2021-01-04", "2022-01-03", "2023-01-02", "2024-01-01", "2025-01-06"].map((d) => {
      const b = backtest(series, field, d);
      return { ...b, error: round(b.error), baseline: round(b.baseline), coverage: Math.round(b.coverage * 1000) / 1000 };
    });

    const data: ProjectionsCache = { generated: now.toISOString(), asOf, level: round(field.get(Number(asOf.slice(0, 4))) ?? 0), backtests, players: top };
    const { error } = await db.from("stat_cache").upsert({ key: `projections:${tour}`, data: data as unknown as Json });
    if (error) throw new Error(`projections: ${error.message}`);
    out[tour] = `${top.length} players`;
  }
  return out;
}

const bandRound = (b: Band): Band => ({ low: round(b.low), mid: round(b.mid), high: round(b.high) });
