import { describe, expect, it } from "vitest";

import type { RaceRow } from "./race";
import { qualifyChances } from "./race-sim";

const row = (key: string, points: number, history: number[] = [], liveOutcomes: RaceRow["liveOutcomes"] = [], liveBanked = 0): RaceRow => ({
  key,
  id: null,
  name: key,
  country: null,
  points,
  projected: points,
  events: history.length + liveOutcomes.length,
  history,
  liveOutcomes,
  liveBanked,
});

describe("qualifyChances", () => {
  it("is certain when the season is over", () => {
    const rows = [row("a", 900), row("b", 800), row("c", 100)];
    const q = qualifyChances({ rows, weeksSoFar: 40, weeksLeft: 0, spots: 2, sims: 200 });
    expect([q.get("a"), q.get("b"), q.get("c")]).toEqual([1, 1, 0]);
  });

  it("follows the live event's outcome chances", () => {
    // b needs to win the event in progress (30% chance) to pass a.
    const rows = [row("a", 700), row("b", 600, [], [[{ points: 300, p: 0.7 }, { points: 500, p: 0.3 }]], 300)];
    const q = qualifyChances({ rows, weeksSoFar: 40, weeksLeft: 0, spots: 1, sims: 4000 });
    expect(q.get("b")!).toBeGreaterThan(0.25);
    expect(q.get("b")!).toBeLessThan(0.35);
  });

  it("gives an active chaser a real chance with weeks left, and sums to the number of spots", () => {
    const rows = [row("a", 2000, [500, 0, 250]), row("b", 1800, [1000, 500, 1000]), row("c", 500, [10, 10])];
    const q = qualifyChances({ rows, weeksSoFar: 10, weeksLeft: 6, spots: 1, sims: 2000 });
    expect(q.get("b")!).toBeGreaterThan(q.get("a")!);
    expect([...q.values()].reduce((s, x) => s + x, 0)).toBeCloseTo(1);
  });

  it("is deterministic for a seed", () => {
    const rows = [row("a", 1000, [100, 200]), row("b", 900, [300])];
    const args = { rows, weeksSoFar: 10, weeksLeft: 4, spots: 1, sims: 500 };
    expect(qualifyChances(args)).toEqual(qualifyChances(args));
  });
});
