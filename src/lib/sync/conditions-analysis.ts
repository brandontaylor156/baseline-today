import "server-only";

import { asRating, fitLogistic, type FactorRow } from "@/lib/lab/factors";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

import { loadMatches } from "./factors";
import type { PaceCache } from "./pace";

const FROM = "2016-01-01";

/** Every row of a query, 1,000 at a time (PostgREST caps each response). */
async function all<T>(
  page: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(`conditions: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export interface ConditionsCache {
  generated: string;
  coverage: {
    events: number;
    indoor: number;
    outdoor: number;
    withWeather: number;
    venues: number;
  };
  tours: Record<
    string,
    {
      /** The model's slope on its own logit at 20, 30 and 35 °C (1 = as calibrated; lower = more upsets), and the heat term per 5 °C. */
      heat: {
        at20: number;
        at30: number;
        at35: number;
        perFive: number;
        low: number;
        high: number;
        matches: number;
      };
      /** What a 70% favourite becomes at each temperature. */
      favourite70: { at20: number; at30: number; at35: number };
      /** Retirement rate by daily high, outdoors, and indoors as a control. */
      retirements: { bin: string; matches: number; rate: number }[];
      indoorRetirement: { matches: number; rate: number };
      /** Jet lag: first event after crossing 5+ time zones, eastward and westward, in rating points. */
      jetlag: {
        east: { points: number; low: number; high: number; matches: number };
        west: { points: number; low: number; high: number; matches: number };
      };
    }
  >;
  /** Elevation against ATP court pace (from the pace job). */
  altitude: {
    r: number;
    events: number;
    high: { name: string; season: number; elevation: number; delta: number }[];
  };
}

/** UTC offset in hours of an IANA time zone on a date. */
function offsetHours(timezone: string, date: string): number | null {
  try {
    const d = new Date(`${date}T12:00:00Z`);
    const local = new Date(d.toLocaleString("en-US", { timeZone: timezone }));
    const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
    return Math.round(((local.getTime() - utc.getTime()) / 3_600_000) * 2) / 2;
  } catch {
    return null;
  }
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
 * Heat, retirements, jet lag and altitude, from real weather, venues and results. Stored in
 * stat_cache as lab:conditions. Weekly.
 */
export async function computeConditions(db: AdminClient, now = new Date()) {
  const [cond, venues, ts, { data: paceRow }] = await Promise.all([
    all((f, t) =>
      db
        .from("event_conditions")
        .select("tournament_id, indoor, temp_max")
        .order("tournament_id")
        .range(f, t),
    ),
    all((f, t) =>
      db
        .from("venues")
        .select("location, elevation, timezone")
        .order("location")
        .range(f, t),
    ),
    all((f, t) =>
      db
        .from("tournaments")
        .select("id, location, name, season")
        .eq("provider", "balldontlie")
        .order("id")
        .range(f, t),
    ),
    db.from("stat_cache").select("data").eq("key", "lab:pace").maybeSingle(),
  ]);
  const conditions = new Map(cond.map((c) => [c.tournament_id, c]));
  const venue = new Map(venues.map((v) => [v.location, v]));
  const tournament = new Map(ts.map((t) => [t.id, t]));
  const { matches } = await loadMatches(db);
  const logit = (p: number) => Math.log(p / (1 - p));
  const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

  const data: ConditionsCache = {
    generated: now.toISOString(),
    coverage: {
      events: conditions.size,
      indoor: cond.filter((c) => c.indoor === true).length,
      outdoor: cond.filter((c) => c.indoor === false).length,
      withWeather: cond.filter((c) => c.temp_max !== null).length,
      venues: venues.filter((v) => v.elevation !== null).length,
    },
    tours: {},
    altitude: { r: 0, events: 0, high: [] },
  };

  for (const tour of ["atp", "wta"] as const) {
    const ms = matches[tour]
      .filter(
        (m) =>
          !m.walkover &&
          m.startDate >= FROM &&
          Number.isFinite(m.p1) &&
          m.p1 > 0 &&
          m.p1 < 1,
      )
      .sort(
        (a, b) => a.startDate.localeCompare(b.startDate) || a.round - b.round,
      );

    // Heat: outdoor events with weather; does the model's own logit lose force as it gets hotter?
    const hot: FactorRow[] = [];
    for (const m of ms) {
      const c = conditions.get(m.tournamentId);
      if (!c || c.indoor !== false || c.temp_max === null) continue;
      const h = (c.temp_max - 25) / 5;
      hot.push({
        logit: logit(m.p1),
        x: [h * logit(m.p1)],
        y: m.winner === 1 ? 1 : 0,
        date: m.startDate,
      });
    }
    const fit = fitLogistic(hot, [true]);
    const slope = (t: number) => fit.beta[0] + fit.beta[1] * ((t - 25) / 5);
    const fav = (t: number) => sigmoid(slope(t) * logit(0.7));

    // Retirements by daily high (outdoors) and indoors.
    const bins = [
      { bin: "Under 20 °C", lo: -50, hi: 20 },
      { bin: "20–25 °C", lo: 20, hi: 25 },
      { bin: "25–30 °C", lo: 25, hi: 30 },
      { bin: "30–35 °C", lo: 30, hi: 35 },
      { bin: "35 °C and up", lo: 35, hi: 60 },
    ];
    const outdoor = ms.flatMap((m) => {
      const c = conditions.get(m.tournamentId);
      return c && c.indoor === false && c.temp_max !== null
        ? [{ t: c.temp_max, retired: Boolean(m.retired) }]
        : [];
    });
    const indoorMs = ms.filter(
      (m) => conditions.get(m.tournamentId)?.indoor === true,
    );

    // Jet lag: each player's previous event within 21 days; the time-zone shift between venues.
    const tzCache = new Map<string, number | null>();
    const tzOf = (tid: number, date: string) => {
      const k = `${tid}|${date}`;
      if (tzCache.has(k)) return tzCache.get(k)!;
      const loc = tournament.get(tid)?.location;
      const tz = loc ? venue.get(loc)?.timezone : null;
      const v = tz ? offsetHours(tz, date) : null;
      tzCache.set(k, v);
      return v;
    };
    const lastEvent = new Map<
      string,
      { tid: number; date: string; offset: number | null }
    >();
    const shift = new Map<string, number>(); // `${key}|${tid}` → hours moved east (+) or west (−)
    for (const m of ms) {
      for (const key of [m.key1, m.key2]) {
        const prev = lastEvent.get(key);
        if (prev && prev.tid === m.tournamentId) continue;
        const offset = tzOf(m.tournamentId, m.startDate);
        if (
          prev &&
          prev.offset !== null &&
          offset !== null &&
          (Date.parse(m.startDate) - Date.parse(prev.date)) / 86_400_000 <= 21
        ) {
          shift.set(`${key}|${m.tournamentId}`, offset - prev.offset);
        }
        lastEvent.set(key, { tid: m.tournamentId, date: m.startDate, offset });
      }
    }
    const firstMatch = new Set<string>();
    const jetRows = (dir: 1 | -1): FactorRow[] =>
      ms.flatMap((m) => {
        const lag = (key: string) => {
          const k = `${key}|${m.tournamentId}`;
          const s = shift.get(k);
          const first = !firstMatch.has(`${dir}|${k}`);
          firstMatch.add(`${dir}|${k}`);
          return first && s !== undefined && s * dir >= 5 ? 1 : 0;
        };
        const x = lag(m.key1) - lag(m.key2);
        return x === 0
          ? []
          : [
              {
                logit: logit(m.p1),
                x: [x],
                y: m.winner === 1 ? (1 as const) : (0 as const),
                date: m.startDate,
              },
            ];
      });
    const effect = (rows: FactorRow[]) => {
      const f = fitLogistic(rows, [true]);
      return {
        points: asRating(f.beta[1]),
        low: asRating(f.beta[1] - 1.96 * f.se[1]),
        high: asRating(f.beta[1] + 1.96 * f.se[1]),
        matches: rows.length,
      };
    };

    data.tours[tour] = {
      heat: {
        at20: slope(20),
        at30: slope(30),
        at35: slope(35),
        perFive: fit.beta[1],
        low: fit.beta[1] - 1.96 * fit.se[1],
        high: fit.beta[1] + 1.96 * fit.se[1],
        matches: hot.length,
      },
      favourite70: { at20: fav(20), at30: fav(30), at35: fav(35) },
      retirements: bins.map((b) => {
        const xs = outdoor.filter((o) => o.t >= b.lo && o.t < b.hi);
        return {
          bin: b.bin,
          matches: xs.length,
          rate: xs.length ? xs.filter((o) => o.retired).length / xs.length : 0,
        };
      }),
      indoorRetirement: {
        matches: indoorMs.length,
        rate: indoorMs.length
          ? indoorMs.filter((m) => m.retired).length / indoorMs.length
          : 0,
      },
      jetlag: { east: effect(jetRows(1)), west: effect(jetRows(-1)) },
    };
  }

  // Altitude against ATP court pace.
  const pace =
    (paceRow?.data as unknown as PaceCache | undefined)?.tours.atp?.events ??
    [];
  const withAlt = pace.flatMap((e) => {
    const loc = tournament.get(e.tournamentId)?.location;
    const el = loc ? venue.get(loc)?.elevation : null;
    return el !== null && el !== undefined ? [{ ...e, elevation: el }] : [];
  });
  data.altitude = {
    r: correlation(
      withAlt.map((e) => e.elevation),
      withAlt.map((e) => e.delta),
    ),
    events: withAlt.length,
    high: withAlt
      .filter((e) => e.elevation >= 500)
      .sort((a, b) => b.elevation - a.elevation)
      .slice(0, 12)
      .map((e) => ({
        name: e.name,
        season: e.season,
        elevation: e.elevation,
        delta: e.delta,
      })),
  };

  const { error } = await db
    .from("stat_cache")
    .upsert({ key: "lab:conditions", data: data as unknown as Json });
  if (error) throw new Error(`conditions: ${error.message}`);
  return {
    coverage: data.coverage,
    altitude: `r=${data.altitude.r.toFixed(2)} over ${data.altitude.events}`,
    ...Object.fromEntries(
      Object.entries(data.tours).map(([t, v]) => [
        t,
        `heat slope 20/30/35: ${v.heat.at20.toFixed(3)}/${v.heat.at30.toFixed(3)}/${v.heat.at35.toFixed(3)} [${v.heat.low.toFixed(3)},${v.heat.high.toFixed(3)}] n${v.heat.matches}; fav70 ${v.favourite70.at20.toFixed(3)}/${v.favourite70.at35.toFixed(3)}; ret ${v.retirements.map((r) => (r.rate * 100).toFixed(1)).join("/")} indoor ${(v.indoorRetirement.rate * 100).toFixed(1)}; east ${v.jetlag.east.points.toFixed(0)} [${v.jetlag.east.low.toFixed(0)},${v.jetlag.east.high.toFixed(0)}] n${v.jetlag.east.matches} west ${v.jetlag.west.points.toFixed(0)} n${v.jetlag.west.matches}`,
      ]),
    ),
  };
}
