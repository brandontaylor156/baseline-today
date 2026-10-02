import { describe, expect, it } from "vitest";

import { disagreements, rankRatings, viewRating, type RatedPlayer } from "./ratings";

const player = (key: string, elo: number, rank: number | null, extra: Partial<RatedPlayer> = {}): RatedPlayer => ({
  key,
  id: null,
  name: key,
  countryCode: null,
  elo,
  surface: { hard: elo, clay: elo, grass: elo },
  matches: 50,
  surfaceMatches: { hard: 30, clay: 15, grass: 5 },
  rank,
  ...extra,
});

describe("rankRatings", () => {
  it("orders by rating and drops thin histories", () => {
    const rows = rankRatings([player("a", 1900, 2), player("b", 2000, 1), player("c", 2100, null, { matches: 5 })], "overall");
    expect(rows.map((r) => [r.key, r.modelRank])).toEqual([
      ["b", 1],
      ["a", 2],
    ]);
  });

  it("blends surface ratings and needs surface matches", () => {
    const clay = player("clay", 1900, 10, { surface: { hard: 1800, clay: 2300, grass: 1800 } });
    expect(viewRating(clay, "clay")).toBe(2100);
    expect(rankRatings([clay, player("x", 2000, 1)], "clay")[0].key).toBe("clay");
    expect(rankRatings([clay], "grass")).toEqual([]);
  });
});

describe("disagreements", () => {
  it("finds players the model rates far above or below their ranking", () => {
    const players = Array.from({ length: 40 }, (_, i) => player(`p${i}`, 2400 - i * 10, i + 1));
    players[3] = player("riser", 2370, 60); // model #4, ranked #60
    players[35] = player("faller", 2050, 5); // model #36, ranked #5
    const rows = rankRatings(players, "overall");
    const { underrated, overrated } = disagreements(rows);
    expect(underrated.map((r) => r.key)).toEqual(["riser"]);
    expect(overrated.map((r) => r.key)).toEqual(["faller"]);
  });
});
