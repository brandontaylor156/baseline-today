import { describe, expect, it } from "vitest";

import { bestOfFive, evaluate, expected, kFactor, newRating, normalizeSurface, runElo, winProbability, type EloMatch } from "./elo";

const m = (key1: string, key2: string, winner: 1 | 2, order: string, surface: EloMatch["surface"] = "hard"): EloMatch => ({ key1, key2, winner, surface, order });

describe("elo", () => {
  it("expects equal players to be 50/50 and a 400-point gap to be about 91%", () => {
    expect(expected(1500, 1500)).toBeCloseTo(0.5);
    expect(expected(1900, 1500)).toBeCloseTo(0.909, 2);
  });

  it("shrinks K as matches accumulate", () => {
    expect(kFactor(0)).toBeGreaterThan(kFactor(50));
    expect(kFactor(0)).toBeCloseTo(250 / Math.pow(5, 0.4));
  });

  it("moves the winner up and the loser down by equal-ish amounts, in date order", () => {
    const { ratings, predictions } = runElo([m("b", "a", 2, "2026-02"), m("a", "b", 1, "2026-01")]);
    expect(ratings.get("a")!.overall).toBeGreaterThan(1500);
    expect(ratings.get("b")!.overall).toBeLessThan(1500);
    expect(predictions[0].p1).toBeCloseTo(0.5); // first match predicted before any update
    expect(predictions[1].p1).toBeLessThan(0.5); // "b" is now the underdog as player 1
  });

  it("tracks surface ratings separately and blends them", () => {
    const { ratings } = runElo([m("a", "b", 1, "1", "clay"), m("a", "b", 1, "2", "clay"), m("b", "a", 1, "3", "grass")]);
    const a = ratings.get("a")!;
    const b = ratings.get("b")!;
    expect(a.surface.clay).toBeGreaterThan(a.surface.grass);
    expect(winProbability(a, b, "clay")).toBeGreaterThan(winProbability(a, b, "grass"));
    expect(winProbability(newRating(), newRating(), null)).toBeCloseTo(0.5);
  });

  it("maps provider surfaces", () => {
    expect(normalizeSurface("Hard")).toBe("hard");
    expect(normalizeSurface("Clay (indoor)")).toBe("clay");
    expect(normalizeSurface(null)).toBeNull();
  });

  it("scores predictions", () => {
    const e = evaluate([
      { match: m("a", "b", 1, "1"), p1: 0.8 },
      { match: m("a", "b", 2, "2"), p1: 0.7 },
    ]);
    expect(e.n).toBe(2);
    expect(e.accuracy).toBe(0.5);
    expect(e.brier).toBeCloseTo(((0.2) ** 2 + 0.7 ** 2) / 2);
  });
});

describe("bestOfFive", () => {
  it("keeps even matches even and stretches favourites", () => {
    expect(bestOfFive(0.5)).toBeCloseTo(0.5);
    expect(bestOfFive(0.7)).toBeGreaterThan(0.7);
    expect(bestOfFive(0.3)).toBeLessThan(0.3);
    expect(bestOfFive(0.7) + bestOfFive(0.3)).toBeCloseTo(1);
  });
});
