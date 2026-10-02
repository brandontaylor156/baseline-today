import { describe, expect, it } from "vitest";

import { holdFrom, liveChance, matchModel, serveModelFor, stateFromScore, type LiveState } from "./live-prob";

const start: LiveState = { setsA: 0, setsB: 0, gamesA: 0, gamesB: 0, pointsA: 0, pointsB: 0, serverA: true, tiebreak: false };

describe("holdFrom", () => {
  it("matches the textbook hold probability", () => {
    // For s = 0.6 a server holds about 73.6% of games.
    expect(holdFrom(0.6, 0, 0)).toBeCloseTo(0.7357, 3);
    expect(holdFrom(0.6, 3, 3)).toBeCloseTo(0.36 / 0.52, 6);
    expect(holdFrom(0.6, 4, 0)).toBe(1);
  });
});

describe("matchModel", () => {
  it("is 50% between equal players, and symmetric", () => {
    expect(matchModel({ a: 0.62, b: 0.62, bestOf: 3 }).match(0, 0)).toBeCloseTo(0.5, 6);
    const m = matchModel({ a: 0.66, b: 0.6, bestOf: 3 }).match(0, 0);
    const flipped = matchModel({ a: 0.6, b: 0.66, bestOf: 3 }).match(0, 0);
    expect(m + flipped).toBeCloseTo(1, 6);
  });
});

describe("serveModelFor", () => {
  it("reproduces the pre-match chance at 0-0", () => {
    for (const p of [0.3, 0.5, 0.72, 0.9]) {
      const m = serveModelFor(p, 3, 0.62);
      expect(liveChance(m, start)).toBeCloseTo(p, 2);
    }
  });
});

describe("liveChance", () => {
  const even = serveModelFor(0.5, 3, 0.62);

  it("moves with the score", () => {
    const upASet = liveChance(even, { ...start, setsA: 1 });
    expect(upASet).toBeGreaterThan(0.7);
    const breakUp = liveChance(even, { ...start, setsA: 1, gamesA: 5, gamesB: 2, serverA: true });
    expect(breakUp).toBeGreaterThan(upASet);
    expect(liveChance(even, { ...start, setsA: 1, gamesA: 5, gamesB: 4, pointsA: 3, pointsB: 0 })).toBeGreaterThan(0.97);
  });

  it("handles tiebreaks and finished matches", () => {
    const tb = liveChance(even, { ...start, setsA: 1, gamesA: 6, gamesB: 6, tiebreak: true, pointsA: 6, pointsB: 2 });
    expect(tb).toBeGreaterThan(0.95);
    expect(liveChance(even, { ...start, setsA: 2 })).toBe(1);
  });
});

describe("stateFromScore", () => {
  it("reads sets, games and points", () => {
    expect(stateFromScore([{ p1: 6, p2: 4 }, { p1: 3, p2: 2 }], "30", "40", true)).toEqual({
      setsA: 1,
      setsB: 0,
      gamesA: 3,
      gamesB: 2,
      pointsA: 2,
      pointsB: 3,
      serverA: true,
      tiebreak: false,
    });
    expect(stateFromScore([{ p1: 6, p2: 6 }], "5", "3", false)?.tiebreak).toBe(true);
    expect(stateFromScore([{ p1: 2, p2: 2 }], "AD", "40", true)?.pointsA).toBe(4);
    expect(stateFromScore([{ p1: 2, p2: 2 }], "15", "40", null)).toBeNull();
  });
});
