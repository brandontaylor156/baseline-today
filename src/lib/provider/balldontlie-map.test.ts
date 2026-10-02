import { describe, expect, it } from "vitest";

import { mapLatestRankings, mapPlayer, type BdlPlayer, type BdlRanking } from "./balldontlie-map";

const sabalenkaSparse: BdlPlayer = {
  id: 1,
  first_name: "Aryna",
  last_name: "Sabalenka",
  full_name: "Aryna Sabalenka",
  country: null,
  country_code: "blr",
  birth_place: null,
  age: null,
  height_cm: null,
  weight_kg: 0,
  plays: null,
  turned_pro: null,
};

function ranking(rank: number, date: string, id = rank): BdlRanking {
  return {
    id: id * 10,
    player: { ...sabalenkaSparse, id, full_name: `Player ${id}` },
    rank,
    points: 1000 - rank,
    movement: 0,
    ranking_date: date,
  };
}

describe("mapPlayer", () => {
  it("normalizes nulls, country code case and non-positive numbers", () => {
    const p = mapPlayer("wta", sabalenkaSparse);
    expect(p).toMatchObject({
      tour: "wta",
      providerId: 1,
      fullName: "Aryna Sabalenka",
      countryCode: "BLR",
      countryName: null,
      weightKg: null,
    });
  });

  it("builds a name when full_name is missing", () => {
    expect(mapPlayer("atp", { ...sabalenkaSparse, full_name: " " }).fullName).toBe("Aryna Sabalenka");
    expect(
      mapPlayer("atp", { ...sabalenkaSparse, full_name: null, first_name: null, last_name: null }).fullName,
    ).toBe("Player 1");
  });
});

describe("mapLatestRankings", () => {
  it("keeps only the newest date, within the limit, sorted by rank", () => {
    const rows = [ranking(2, "2026-09-28"), ranking(1, "2026-09-28"), ranking(1, "2026-09-21", 9), ranking(3, "2026-09-28")];
    const result = mapLatestRankings("atp", rows, 2);
    expect(result.map((r) => [r.rank, r.player.providerId, r.rankingDate])).toEqual([
      [1, 1, "2026-09-28"],
      [2, 2, "2026-09-28"],
    ]);
  });

  it("returns nothing for an empty page", () => {
    expect(mapLatestRankings("wta", [], 100)).toEqual([]);
  });
});
