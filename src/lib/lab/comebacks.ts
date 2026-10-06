// Comeback curves (pure, unit tested): after a gap of eight weeks or more between events, how far
// below (or above) their rating players perform in each event back, by how long they were away.
// Performance is measured against the model's pre-match chances, as a shift in rating points.

export interface ComebackMatch {
  key: string;
  tournamentId: number;
  startDate: string;
  /** The model's pre-match chance for this player, and whether they won. */
  p: number;
  won: boolean;
}

export const GAP_BUCKETS = [
  { key: "8-16", label: "8–16 weeks", min: 56, max: 112 },
  { key: "16-26", label: "16–26 weeks", min: 112, max: 182 },
  { key: "26+", label: "Half a year or more", min: 182, max: Infinity },
] as const;

export const EVENTS_BACK = 6;

export interface Return {
  key: string;
  /** Start of the first event back, and days since the event before. */
  date: string;
  gap: number;
  /** Per event back (1st, 2nd, …): the player's matches as [chance, won]. */
  events: [number, boolean][][];
}

const DAY = 86_400_000;
const t = (d: string) => Date.parse(`${d.slice(0, 10)}T00:00:00Z`);
const overlap = (a: number, b: number, from: number, to: number) => Math.max(0, Math.min(b, to) - Math.max(a, from));

/**
 * Days between two event starts that the tour was actually running: the off-season (20 November to
 * 31 December) and the 2020 suspension don't count, so nobody is "out" just for those.
 */
export function playingDays(from: string, to: string): number {
  const a = t(from);
  const b = t(to);
  let off = overlap(a, b, t("2020-03-16"), t("2020-08-10"));
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) off += overlap(a, b, t(`${y}-11-20`), t(`${y + 1}-01-01`));
  return (b - a - off) / DAY;
}

/** Every return from a gap of 56+ days, with the matches in the first events back. */
export function findReturns(matches: ComebackMatch[]): Return[] {
  const byPlayer = new Map<string, Map<number, { date: string; ms: [number, boolean][] }>>();
  for (const m of matches) {
    const events = byPlayer.get(m.key) ?? new Map();
    const e = events.get(m.tournamentId) ?? { date: m.startDate, ms: [] };
    e.ms.push([m.p, m.won]);
    events.set(m.tournamentId, e);
    byPlayer.set(m.key, events);
  }
  const out: Return[] = [];
  for (const [key, events] of byPlayer) {
    const list = [...events.values()].sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 1; i < list.length; i++) {
      const gap = playingDays(list[i - 1].date, list[i].date);
      if (gap < 56) continue;
      out.push({ key, date: list[i].date, gap, events: list.slice(i, i + EVENTS_BACK).map((e) => e.ms) });
    }
  }
  return out;
}

/**
 * The rating shift that makes the model's chances match the results (Σ p(δ) = Σ won). With
 * `priorSd`, shrunk toward zero (a normal prior), so a handful of matches can't give ±infinity.
 */
export function ratingShift(ms: [number, boolean][], priorSd = Infinity): { shift: number; se: number; n: number } {
  const xs = ms.filter(([p]) => p > 0 && p < 1);
  if (xs.length === 0) return { shift: 0, se: Infinity, n: 0 };
  const k = Math.LN10 / 400;
  let d = 0;
  let info = 0;
  for (let it = 0; it < 30; it++) {
    let g = 0;
    info = 0;
    for (const [p, won] of xs) {
      const q = 1 / (1 + ((1 - p) / p) * Math.exp(-k * d));
      g += (won ? 1 : 0) - q;
      info += k * q * (1 - q);
    }
    const prior = 1 / priorSd ** 2;
    const step = (k * g - d * prior) / (k * info + prior);
    d += Math.max(-200, Math.min(200, step));
    if (Math.abs(step) < 1e-6) break;
  }
  // Fisher information for the shift: Σ k² q(1 − q) = k · info, plus the prior's.
  return { shift: d, se: 1 / Math.sqrt(k * info + 1 / priorSd ** 2), n: xs.length };
}

export interface CurvePoint {
  event: number;
  shift: number;
  low: number;
  high: number;
  matches: number;
}

/** For each gap bucket, the shift in each event back (1st to 6th). */
export function comebackCurves(returns: Return[]): Record<string, CurvePoint[]> {
  const out: Record<string, CurvePoint[]> = {};
  for (const b of GAP_BUCKETS) {
    const mine = returns.filter((r) => r.gap >= b.min && r.gap < b.max);
    out[b.key] = Array.from({ length: EVENTS_BACK }, (_, i) => {
      const ms = mine.flatMap((r) => r.events[i] ?? []);
      const { shift, se, n } = ratingShift(ms);
      return { event: i + 1, shift, low: shift - 1.96 * se, high: shift + 1.96 * se, matches: n };
    });
  }
  return out;
}
