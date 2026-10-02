// Chance of finishing in the qualifying places (pure, unit tested; seeded so pages are stable).
// Each simulated season: events in progress end according to the title-odds chances; each player
// then plays a Poisson number of further events at their season rate, scoring like a random one
// of their own finished events this season. Rough by design, and labelled as such.
import type { RaceRow } from "@/lib/race";

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(mean: number, rand: () => number): number {
  if (mean <= 0) return 0;
  const limit = Math.exp(-mean);
  let k = 0;
  let p = rand();
  while (p > limit) {
    k++;
    p *= rand();
  }
  return k;
}

export interface QualifyInput {
  rows: RaceRow[];
  /** Weeks of the season so far and left before the cutoff. */
  weeksSoFar: number;
  weeksLeft: number;
  spots: number;
  sims?: number;
  seed?: number;
  /** Only the top `field` players by projected points are simulated. */
  field?: number;
}

export function qualifyChances({ rows, weeksSoFar, weeksLeft, spots, sims = 4000, seed = 42, field = 40 }: QualifyInput): Map<string, number> {
  const rand = rng(seed);
  const pool = [...rows].sort((a, b) => b.projected - a.projected).slice(0, field);
  const hits = new Map(pool.map((r) => [r.key, 0]));
  const totals = new Array<number>(pool.length);
  const order = pool.map((_, i) => i);

  for (let s = 0; s < sims; s++) {
    pool.forEach((r, i) => {
      let total = r.points - r.liveBanked;
      for (const outcomes of r.liveOutcomes) {
        let u = rand();
        let pick = outcomes.at(-1)?.points ?? 0;
        for (const o of outcomes) {
          if (u < o.p) {
            pick = o.points;
            break;
          }
          u -= o.p;
        }
        total += pick;
      }
      if (weeksLeft > 0 && r.history.length > 0 && weeksSoFar > 0) {
        const rate = Math.min(1, (r.history.length + r.liveOutcomes.length) / weeksSoFar);
        const n = poisson(rate * weeksLeft, rand);
        for (let k = 0; k < n; k++) total += r.history[Math.floor(rand() * r.history.length)];
      }
      totals[i] = total;
    });
    order.sort((a, b) => totals[b] - totals[a]);
    for (let k = 0; k < Math.min(spots, order.length); k++) hits.set(pool[order[k]].key, hits.get(pool[order[k]].key)! + 1);
  }
  return new Map([...hits].map(([k, v]) => [k, v / sims]));
}
