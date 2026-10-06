// "If a major started today" (pure, unit tested): random draws made with Grand Slam seeding rules,
// each solved exactly through the bracket, averaged into every player's chance of each round.

import { lineBracket, reachChances, type Node } from "./bracket";

/** Seeded PRNG (mulberry32) so a forecast is reproducible. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Slot order of seed numbers in a standard bracket of `size` (slot i holds seed order[i]). */
function seedSlots(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const s = order.length * 2;
    order = order.flatMap((x) => [x, s + 1 - x]);
  }
  return order;
}

/**
 * One random draw: players in seeding order (best first). Seeds 1 and 2 keep their lines; seeds
 * 3–4, 5–8, 9–16 and 17–32 are drawn into their group's lines; everyone else fills the rest at random.
 */
export function randomDraw(players: string[], rand: () => number, seeds = 32): Node | null {
  const size = players.length;
  const slots = seedSlots(size);
  const line = new Array<string>(size);
  const groups = [
    [1, 1],
    [2, 2],
    [3, 4],
    [5, 8],
    [9, 16],
    [17, 32],
  ].filter(([lo]) => lo <= seeds);
  const used = new Set<number>();
  for (const [lo, hi] of groups) {
    const members = players.slice(lo - 1, Math.min(hi, seeds));
    const lines = slots.map((s, i) => [s, i] as const).filter(([s]) => s >= lo && s <= Math.min(hi, seeds)).map(([, i]) => i);
    const order = shuffle(lines, rand);
    members.forEach((p, k) => {
      line[order[k]] = p;
      used.add(order[k]);
    });
  }
  const free = shuffle(
    slots.map((_, i) => i).filter((i) => !used.has(i)),
    rand,
  );
  players.slice(seeds).forEach((p, k) => (line[free[k]] = p));
  return lineBracket(line);
}

/** Average chance of reaching each round across `draws` random draws. */
export function forecast(players: string[], p: (a: string, b: string) => number, draws = 200, seed = 1): Map<string, number[]> {
  const rand = rng(seed);
  // Pairwise chances once: draws only change who meets whom.
  const cache = new Map<string, number>();
  const pp = (a: string, b: string) => {
    const k = `${a}|${b}`;
    let v = cache.get(k);
    if (v === undefined) cache.set(k, (v = p(a, b)));
    return v;
  };
  const total = new Map<string, number[]>();
  for (let d = 0; d < draws; d++) {
    const tree = randomDraw(players, rand);
    if (!tree) return total;
    for (const [k, arr] of reachChances(tree, pp)) {
      const t = total.get(k) ?? new Array(arr.length).fill(0);
      arr.forEach((x, i) => (t[i] += x / draws));
      total.set(k, t);
    }
  }
  return total;
}
