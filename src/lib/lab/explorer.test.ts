import { describe, expect, it } from "vitest";

import { applyFilters, parseFilters, splits, winsAboveExpected, type Line } from "./explorer";

const line = (over: Partial<Line>): Line => ({
  matchId: 1,
  season: 2024,
  date: "2024-05-01",
  tournamentId: 1,
  tournament: "X",
  category: "ATP 500",
  surface: "Clay",
  round: "Final",
  roundRank: 7,
  opponent: { id: 2, name: "B", country: null },
  won: true,
  sets: [
    [6, 4],
    [7, 6],
  ],
  chance: 0.6,
  retired: false,
  walkover: false,
  ...over,
});

describe("parseFilters", () => {
  it("keeps only recognised values", () => {
    expect(parseFilters({ o: "12", surface: "Clay", stage: "sf", cat: "slam", result: "w", role: "underdog", deciding: "1", tb: "1", from: "2020" })).toEqual({
      opponent: 12,
      surface: "Clay",
      from: 2020,
      to: undefined,
      stage: "sf",
      category: "slam",
      result: "w",
      role: "underdog",
      deciding: true,
      tiebreak: true,
    });
    expect(parseFilters({ surface: "Carpet", o: "x", stage: "r1" })).toMatchObject({ surface: undefined, opponent: undefined, stage: undefined });
  });
});

describe("applyFilters", () => {
  const lines = [
    line({ matchId: 1 }),
    line({ matchId: 2, surface: "Hard", won: false, chance: 0.3, roundRank: 2, round: "Second round" }),
    line({ matchId: 3, category: "Grand Slam", sets: [[6, 4], [3, 6], [6, 3], [4, 6], [6, 2]], opponent: { id: 9, name: "C", country: null } }),
    line({ matchId: 4, walkover: true }),
  ];
  const ids = (f: Parameters<typeof applyFilters>[1]) => applyFilters(lines, f).map((l) => l.matchId);
  it("filters by each field and always drops walkovers", () => {
    expect(ids({})).toEqual([1, 2, 3]);
    expect(ids({ surface: "Hard" })).toEqual([2]);
    expect(ids({ opponent: 9 })).toEqual([3]);
    expect(ids({ stage: "early" })).toEqual([2]);
    expect(ids({ category: "slam" })).toEqual([3]);
    expect(ids({ role: "underdog" })).toEqual([2]);
    expect(ids({ deciding: true })).toEqual([3]);
    expect(ids({ tiebreak: true })).toEqual([1, 2]);
    expect(ids({ result: "l" })).toEqual([2]);
  });
});

describe("splits and expectation", () => {
  it("counts wins and losses per key and against the model", () => {
    const lines = [line({}), line({ won: false, surface: "Hard", chance: 0.8 }), line({ surface: "Hard", chance: null })];
    expect(splits(lines, (l) => l.surface)).toEqual([
      { key: "Clay", w: 1, l: 0 },
      { key: "Hard", w: 1, l: 1 },
    ]);
    const e = winsAboveExpected(lines);
    expect(e.n).toBe(2);
    expect(e.expected).toBeCloseTo(1.4);
    expect(e.actual).toBe(1);
  });
});
