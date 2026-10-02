import { describe, expect, it } from "vitest";

import { pathDifficulty } from "./draw-difficulty";
import type { DrawModel } from "./draw-model";

const rating = (elo: number) => ({ overall: elo, surface: { hard: elo, clay: elo, grass: elo }, matches: 50, surfaceMatches: { hard: 20, clay: 20, grass: 10 } });
const player = (key: string, position: number, elo: number) => ({ key, id: null, name: key, countryCode: null, seed: null, position, rating: rating(elo) });

describe("pathDifficulty", () => {
  // 4-draw: a(2000) v b(1500), c(1600) v d(1600); "a" has a bye in an 8-draw variant below.
  const model: DrawModel = {
    tournamentId: 1,
    size: 4,
    rounds: 2,
    surface: "hard",
    calibration: 1,
    players: [player("a", 0, 2000), player("b", 1, 1500), player("c", 2, 1600), player("d", 3, 1600)],
    played: [{ winner: "b", loser: "a" }], // ignored: difficulty is measured at the start
  };
  const d = pathDifficulty(model);

  it("rates first-round opponents directly", () => {
    expect(d.get("a")!.byRound[0]).toBe(1500);
    expect(d.get("b")!.byRound[0]).toBe(2000);
  });

  it("weights later opponents by who is likely to get there", () => {
    // c and d are equal, so the semifinal opponent of a is 1600 either way.
    expect(d.get("a")!.byRound[1]).toBeCloseTo(1600);
    // For c, the likely opponent is mostly a (2000) and sometimes b (1500).
    expect(d.get("c")!.byRound[1]).toBeGreaterThan(1850);
    expect(d.get("c")!.average).toBeGreaterThan(d.get("a")!.average);
  });

  it("marks byes", () => {
    const byes = pathDifficulty({ ...model, size: 8, rounds: 3, players: [player("a", 0, 2000), player("c", 2, 1600), player("d", 3, 1600)] });
    expect(byes.get("a")!.byRound[0]).toBeNull();
  });
});
