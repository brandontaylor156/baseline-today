// Pure analysis of trial measurements (unit tested). Produces the numbers for the pay/no-pay call.

export interface Poll {
  source: string;
  tour: string;
  polled_at: string;
  http_status: number | null;
  latency_ms: number | null;
  live_count: number | null;
}

export interface Observation {
  source: string;
  tour: string;
  match_key: string;
  players_key: string;
  games_state: string;
  point_state: string | null;
  status: string | null;
  observed_at: string;
}

export function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function summarizePolls(polls: Poll[]) {
  const groups = new Map<string, Poll[]>();
  for (const p of polls) groups.set(`${p.source}/${p.tour}`, [...(groups.get(`${p.source}/${p.tour}`) ?? []), p]);
  return [...groups.entries()].map(([key, ps]) => ({
    key,
    polls: ps.length,
    ok: ps.filter((p) => p.http_status === 200).length,
    rateLimited: ps.filter((p) => p.http_status === 429).length,
    unauthorized: ps.filter((p) => p.http_status === 401 || p.http_status === 403).length,
    medianLatencyMs: quantile(ps.map((p) => p.latency_ms ?? 0).filter(Boolean), 0.5),
    maxLive: Math.max(0, ...ps.map((p) => p.live_count ?? 0)),
  }));
}

/** Seconds between consecutive changes of the same provider match (points or games). */
export function updateIntervals(obs: Observation[], source = "balldontlie"): number[] {
  const byMatch = new Map<string, Observation[]>();
  for (const o of obs.filter((o) => o.source === source)) {
    byMatch.set(`${o.tour}/${o.match_key}`, [...(byMatch.get(`${o.tour}/${o.match_key}`) ?? []), o]);
  }
  const out: number[] = [];
  for (const list of byMatch.values()) {
    const sorted = list.sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));
    for (let i = 1; i < sorted.length; i++) {
      out.push((Date.parse(sorted[i].observed_at) - Date.parse(sorted[i - 1].observed_at)) / 1000);
    }
  }
  return out;
}

/**
 * Lag of the provider behind the reference: for each games state both sources showed for the
 * same match (paired by tour + players_key), first-seen(provider) - first-seen(reference), seconds.
 * Positive = provider later. Each side's polling interval adds up to that much noise.
 */
export function gameLags(obs: Observation[], provider = "balldontlie", reference = "espn"): number[] {
  const firstSeen = (source: string) => {
    const m = new Map<string, number>();
    for (const o of obs) {
      if (o.source !== source || !o.games_state) continue;
      const k = `${o.tour}|${o.players_key}|${o.games_state}`;
      const t = Date.parse(o.observed_at);
      if (!m.has(k) || t < m.get(k)!) m.set(k, t);
    }
    return m;
  };
  const p = firstSeen(provider);
  const r = firstSeen(reference);
  const lags: number[] = [];
  for (const [k, tp] of p) {
    const tr = r.get(k);
    if (tr !== undefined) lags.push((tp - tr) / 1000);
  }
  return lags;
}

/** Live matches each source saw (paired by tour + players). */
export function coverage(obs: Observation[], provider = "balldontlie", reference = "espn") {
  const seen = (s: string) => new Set(obs.filter((o) => o.source === s).map((o) => `${o.tour}|${o.players_key}`));
  const p = seen(provider);
  const r = seen(reference);
  return {
    provider: p.size,
    reference: r.size,
    both: [...p].filter((k) => r.has(k)).length,
    referenceOnly: [...r].filter((k) => !p.has(k)),
  };
}
