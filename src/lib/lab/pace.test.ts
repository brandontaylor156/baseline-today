import { describe, expect, it } from "vitest";

import { serveModelFor } from "@/lib/live-prob";
import { setScores } from "@/lib/scorelines";

import { rng } from "./forecast";
import { fitPace, type PaceMatch } from "./pace";

/** Simulated events: set scores drawn from the serve model at a known serve rate. */
function event(rate: number, n: number, seed: number): PaceMatch[] {
  const rand = rng(seed);
  const out: PaceMatch[] = [];
  for (let i = 0; i < n; i++) {
    const p1 = 0.3 + rand() * 0.4;
    const dist = setScores(serveModelFor(p1, 3, rate), rand() < 0.5 ? 1 : 0);
    const sets: [number, number][] = [];
    let w1 = 0;
    let w2 = 0;
    while (w1 < 2 && w2 < 2) {
      let u = rand();
      const o = dist.find((d) => (u -= d.p) < 0) ?? dist.at(-1)!;
      sets.push([o.a, o.b]);
      if (o.a > o.b) w1++;
      else w2++;
    }
    out.push({ p1, bestOf: 3, sets });
  }
  return out;
}

describe("fitPace", () => {
  it("tells a fast event from a slow one", () => {
    const fast = fitPace(event(0.68, 120, 1), 0.62).rate;
    const slow = fitPace(event(0.56, 120, 2), 0.62).rate;
    expect(fast).toBeGreaterThan(0.64);
    expect(slow).toBeLessThan(0.6);
  }, 60_000); // simulating the events is the slow part
  it("keeps a tiny event near the tour average", () => {
    const r = fitPace(event(0.7, 3, 3), 0.62).rate;
    expect(Math.abs(r - 0.62)).toBeLessThan(0.04);
  }, 60_000);
});
