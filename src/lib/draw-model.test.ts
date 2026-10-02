import { describe, expect, it } from "vitest";

import { bracketRounds, drawChances, roundName, titleChances, type DrawModel } from "./draw-model";

const rating = (elo: number) => ({ overall: elo, surface: { hard: elo, clay: elo, grass: elo }, matches: 50, surfaceMatches: { hard: 20, clay: 20, grass: 10 } });
const player = (key: string, position: number, elo = 1500) => ({ key, id: null, name: key.toUpperCase(), countryCode: null, seed: null, position, rating: rating(elo) });

// 8-place draw, place 1 is a bye for "a"; "c" beat "d" already.
const model: DrawModel = {
  tournamentId: 1,
  size: 8,
  rounds: 3,
  surface: "hard",
  calibration: 1,
  players: [player("a", 0, 1800), player("c", 2), player("d", 3), player("e", 4), player("f", 5), player("g", 6), player("h", 7)],
  played: [{ winner: "c", loser: "d" }],
};

describe("roundName", () => {
  it("names rounds from the end", () => {
    expect([1, 2, 3, 4, 5].map((r) => roundName(r, 5))).toEqual(["Round of 32", "Round of 16", "Quarterfinals", "Semifinals", "Final"]);
  });
});

describe("bracketRounds", () => {
  const real = drawChances(model);
  const rounds = bracketRounds(model, real, real);

  it("lays out byes, real results and open matches", () => {
    expect(rounds.map((r) => r.length)).toEqual([4, 2, 1]);
    const [bye, played, open] = rounds[0];
    expect(bye.slots[1].bye).toBe(true);
    expect(bye.winner).toBe("a");
    expect(played.winner).toBe("c");
    expect(played.real).toBe(true);
    expect(open.winner).toBeNull();
    expect(open.slots.map((s) => s.key)).toEqual(["e", "f"]);
  });

  it("knows who meets in the next round, and guesses where it can't", () => {
    expect(rounds[1][0].slots.map((s) => s.key)).toEqual(["a", "c"]);
    expect(rounds[1][1].slots[0].key).toBeNull();
    expect(rounds[1][1].slots[0].likely?.p).toBeCloseTo(0.5);
  });

  it("applies a what-if pick", () => {
    const picks = [{ winner: "e", loser: "f" }];
    const scenario = drawChances(model, picks);
    const r = bracketRounds(model, scenario, real);
    expect(r[0][2].winner).toBe("e");
    expect(r[0][2].real).toBe(false);
    expect(r[1][1].slots[0].key).toBe("e");
    const odds = titleChances(model, picks)!;
    expect(odds.players.some((p) => p.key === "f")).toBe(false);
    expect(odds.players.reduce((s, p) => s + p.title, 0)).toBeCloseTo(1);
  });
});
