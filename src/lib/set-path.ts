// Win chance after each set (pure, unit tested). Sets update two things: the score, and what the
// day's form looks like. Before the match, A's level on the day is uncertain (a form spread, as in
// the scoreline model, tuned here on in-match accuracy); each set A wins or loses reweights that
// belief, then the match is solved exactly from the new set score.

import { matchModel, serveModelFor } from "@/lib/live-prob";
import { formNodes } from "@/lib/scorelines";

/**
 * Form spread for updating during a match: 1.5 gave the best chance after the first set on both
 * tours (tried 0.75–2.5), and calibrates "the favourite lost the first set" to within a few points.
 */
export const IN_MATCH_TAU: Record<"atp" | "wta", number> = { atp: 1.5, wta: 1.5 };

interface Node {
  w: number;
  /** A's chance to win a set on this node, and the match from a set score. */
  set: number;
  match: (sa: number, sb: number) => number;
}

const cache = new Map<string, Node[]>();

function nodes(pre: number, bestOf: 3 | 5, params: { average: number; tau: number }): Node[] {
  const p = Math.min(0.995, Math.max(0.005, Math.round(pre * 200) / 200));
  const key = `${p}|${bestOf}|${params.average}|${params.tau}`;
  let out = cache.get(key);
  if (!out) {
    out = formNodes(p, params.tau).map((n) => {
      const mm = matchModel(serveModelFor(Math.min(0.995, Math.max(0.005, n.p)), bestOf, params.average));
      return { w: n.w, set: (mm.set(0, 0, 1) + mm.set(0, 0, 0)) / 2, match: (sa: number, sb: number) => mm.match(sa, sb) };
    });
    cache.set(key, out);
  }
  return out;
}

/**
 * A's chance before the match and after each set, given who won each set in order
 * (1 = A, 2 = B). The last value is 1 or 0 once the match is decided.
 */
export function setPath(pre: number, bestOf: 3 | 5, params: { average: number; tau: number }, sets: (1 | 2)[]): number[] {
  const ns = nodes(pre, bestOf, params);
  const w = ns.map((n) => n.w);
  const need = Math.ceil(bestOf / 2);
  const out: number[] = [pre];
  let sa = 0;
  let sb = 0;
  for (const s of sets) {
    ns.forEach((n, i) => (w[i] *= s === 1 ? n.set : 1 - n.set));
    if (s === 1) sa++;
    else sb++;
    if (sa >= need || sb >= need) {
      out.push(sa >= need ? 1 : 0);
      break;
    }
    const total = w.reduce((a, b) => a + b, 0);
    out.push(ns.reduce((acc, n, i) => acc + (w[i] / total) * n.match(sa, sb), 0));
  }
  return out;
}

/** The winner's lowest chance along the way (before the match or after any set). */
export function lowestForWinner(path: number[], winner: 1 | 2): number {
  const theirs = path.slice(0, -1).map((p) => (winner === 1 ? p : 1 - p));
  return Math.min(...theirs);
}

/** A's chance to win the next set, after the sets so far (each reweighting the day's form). */
export function nextSetChance(pre: number, bestOf: 3 | 5, params: { average: number; tau: number }, sets: (1 | 2)[]): number {
  const ns = nodes(pre, bestOf, params);
  const w = ns.map((n) => n.w);
  for (const s of sets) ns.forEach((n, i) => (w[i] *= s === 1 ? n.set : 1 - n.set));
  const total = w.reduce((a, b) => a + b, 0);
  return ns.reduce((acc, n, i) => acc + (w[i] / total) * n.set, 0);
}
