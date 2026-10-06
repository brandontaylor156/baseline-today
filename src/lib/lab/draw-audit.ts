// Draw-integrity audit (pure, unit tested). The rules: seeds go to fixed or drawn seed lines, and
// every unseeded entrant (qualifiers, wildcards and lucky losers included) is drawn at random into
// the remaining lines. So, given the real seeds' lines, the top seeds' first-round opponents should
// look like a random sample of the unseeded field. A permutation test asks whether they were weaker
// than that, using each player's rating from before the event.

import { rng, shuffle } from "./forecast";

export interface AuditLine {
  position: number;
  key: string;
  /** Seed number, or null for unseeded (qualifiers, wildcards and the rest). */
  seed: number | null;
}

export interface AuditResult {
  /** Mean rating of the top seeds' first-round opponents: actual, and on average over random draws. */
  observed: number;
  expected: number;
  /** Share of random draws whose top seeds faced opponents at least as weak (one-sided p-value). */
  p: number;
  seeds: number;
}

/** Benjamini–Hochberg: which of many p-values survive a false discovery rate of `q`. */
export function benjaminiHochberg(ps: number[], q = 0.05): boolean[] {
  const order = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  let cut = -1;
  order.forEach(([p], k) => {
    if (p <= ((k + 1) / ps.length) * q) cut = k;
  });
  const out = new Array<boolean>(ps.length).fill(false);
  for (let k = 0; k <= cut; k++) out[order[k][1]] = true;
  return out;
}

/**
 * First-round opponents of seeds 1–`top` (those without a bye) against `shuffles` random
 * placements of the unseeded players into the unseeded lines.
 */
export function auditDraw(lines: AuditLine[], rating: (key: string) => number | null, top = 8, shuffles = 2000, seed = 1): AuditResult | null {
  const at = new Map(lines.map((l) => [l.position, l]));
  const unseeded = lines.filter((l) => l.seed === null);
  const slots = unseeded.map((l) => l.position);
  // Players with no rating yet (debutants) count at the median of the rest.
  const raw = unseeded.map((l) => rating(l.key));
  const known = raw.filter((r): r is number => r !== null).sort((a, b) => a - b);
  const median = known[Math.floor(known.length / 2)] ?? 1500;
  const ratings = raw.map((r) => r ?? median);
  // Top seeds whose first-round partner line holds an unseeded player.
  const partners = lines
    .filter((l) => l.seed !== null && l.seed <= top)
    .map((l) => l.position ^ 1)
    .filter((p) => at.get(p)?.seed === null);
  if (partners.length < 2) return null;
  const slotIndex = new Map(slots.map((p, i) => [p, i]));
  const mean = (assignment: number[]) => partners.reduce((s, p) => s + ratings[assignment[slotIndex.get(p)!]], 0) / partners.length;
  const actual = mean(slots.map((_, i) => i));
  const rand = rng(seed);
  let asWeak = 0;
  let total = 0;
  const idx = slots.map((_, i) => i);
  for (let s = 0; s < shuffles; s++) {
    const m = mean(shuffle(idx, rand));
    total += m;
    if (m <= actual) asWeak++;
  }
  return { observed: actual, expected: total / shuffles, p: (asWeak + 1) / (shuffles + 1), seeds: partners.length };
}
