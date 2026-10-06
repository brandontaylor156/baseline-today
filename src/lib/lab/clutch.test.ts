import { describe, expect, it } from "vitest";

import { clutchStats, expectedFor, zScore, type ClutchMatch } from "./clutch";

describe("expectedFor", () => {
  it("is 50/50 for even players and rises with the pre-match chance", () => {
    const even = expectedFor(0.5, 3, "atp");
    expect(even.tiebreak).toBeCloseTo(0.5, 2);
    expect(even.decider).toBeCloseTo(0.5, 2);
    const fav = expectedFor(0.75, 3, "atp");
    expect(fav.decider).toBeGreaterThan(0.6);
    // A set is closer than a match, and a tiebreak closer still.
    expect(fav.decider).toBeLessThan(0.75);
    expect(fav.tiebreak).toBeGreaterThan(0.5);
    expect(fav.tiebreak).toBeLessThan(fav.decider);
  });
});

describe("clutchStats", () => {
  const m = (over: Partial<ClutchMatch>): ClutchMatch => ({ tour: "atp", key1: "A", key2: "B", winner: 1, bestOf: 3, p1: 0.5, sets: [[7, 6], [4, 6], [6, 3]], ...over });
  it("counts tiebreaks and deciders from both sides", () => {
    const [a, b] = clutchStats([m({}), m({ winner: 2, sets: [[6, 7], [6, 7]] })]);
    expect(a.tiebreaks).toMatchObject({ n: 3, won: 1 });
    expect(b.tiebreaks).toMatchObject({ n: 3, won: 2 });
    expect(a.deciders).toMatchObject({ n: 1, won: 1 });
    expect(a.tiebreaks.expected).toBeCloseTo(1.5, 1);
  });
  it("z-scores winning more than expected as positive", () => {
    const rows = clutchStats(Array.from({ length: 20 }, () => m({ sets: [[7, 6], [7, 6]] })));
    expect(zScore(rows.find((r) => r.key === "A")!.tiebreaks)).toBeGreaterThan(3);
    expect(zScore({ n: 0, won: 0, expected: 0, variance: 0 })).toBe(0);
  });
});
