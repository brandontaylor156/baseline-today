import { describe, expect, it } from "vitest";

import type { DrawModel } from "./draw-model";
import { drawReport } from "./draw-report";

const rating = (overall: number) => ({ overall, surface: { hard: overall, clay: overall, grass: overall }, matches: 99, surfaceMatches: { hard: 99, clay: 99, grass: 99 } });

// 16 players; seeds 1–4 in their usual lines; the strongest unseeded player (2100) lands in seed 1's quarter.
function model(): DrawModel {
  const elo = [2300, 1600, 1600, 2100, 1800, 1600, 1600, 1600, 1600, 1600, 1600, 1700, 1600, 1600, 1600, 2250];
  const seeds: Record<number, string> = { 0: "1", 15: "2", 4: "3", 11: "4" };
  return {
    tournamentId: 1,
    size: 16,
    rounds: 4,
    surface: "hard",
    calibration: 1,
    bestOf: 3,
    played: [],
    players: elo.map((e, i) => ({ key: `p${i}`, id: i, name: `Player ${i}`, countryCode: null, seed: seeds[i] ?? null, position: i, rating: rating(e) })),
  };
}

describe("drawReport", () => {
  const r = drawReport(model(), 200);

  it("splits the draw into quarters and finds each favourite", () => {
    expect(r.quarters).toHaveLength(4);
    expect(r.quarters[0].favourite.key).toBe("p0");
    expect(r.quarters.reduce((s, q) => s + q.titleShare, 0)).toBeCloseTo(1, 6);
    // Seed 1's quarter holds the dangerous unseeded player: the quarter of death.
    const death = [...r.quarters].sort((a, b) => b.rivalShare - a.rivalShare)[0];
    expect(death.index).toBe(0);
    // Seed 4's quarter has a weak favourite: the most open.
    expect([...r.quarters].sort((a, b) => a.favouriteChance - b.favouriteChance)[0].index).toBe(2);
  });

  it("finds seed 1 unlucky against random draws", () => {
    const one = r.luck.find((l) => l.player.seed === "1")!;
    expect(one.semi).toBeLessThan(one.semiAverage);
  });

  it("lists matchups whose chances are consistent", () => {
    expect(r.finals[0].round).toBe(4);
    expect(new Set([r.finals[0].a.key, r.finals[0].b.key])).toEqual(new Set(["p0", "p15"]));
    expect(r.quarterfinals.every((m) => m.p > 0 && m.p <= 1)).toBe(true);
    expect(r.darkHorses[0].key).toBe("p3");
  });
});
