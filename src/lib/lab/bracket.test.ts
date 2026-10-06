import { describe, expect, it } from "vitest";

import { depth, entrants, reachChances, reconstruct, seededBracket, winChances, type DrawMatch } from "./bracket";

// An 8-player draw: A beats B, C beats D, E beats F, G beats H; A beats C, E beats G; A beats E.
const draw8: DrawMatch[] = [
  { key1: "A", key2: "B", winner: 1, round: 1 },
  { key1: "C", key2: "D", winner: 1, round: 1 },
  { key1: "E", key2: "F", winner: 1, round: 1 },
  { key1: "H", key2: "G", winner: 2, round: 1 },
  { key1: "C", key2: "A", winner: 2, round: 2 },
  { key1: "E", key2: "G", winner: 1, round: 2 },
  { key1: "A", key2: "E", winner: 1, round: 3 },
];

describe("reconstruct", () => {
  it("rebuilds the bracket from results in any order", () => {
    const tree = reconstruct([...draw8].reverse())!;
    expect(tree).not.toBeNull();
    expect(entrants(tree).sort()).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
    expect(depth(tree)).toBe(3);
    expect("winner" in tree && tree.winner).toBe("A");
  });

  it("handles byes into the second round", () => {
    const withBye: DrawMatch[] = [
      { key1: "B", key2: "C", winner: 1, round: 1 },
      { key1: "A", key2: "B", winner: 1, round: 2 }, // A had a bye
    ];
    const tree = reconstruct(withBye)!;
    expect(entrants(tree).sort()).toEqual(["A", "B", "C"]);
  });

  it("rejects draws with missing rounds or players who lost twice", () => {
    expect(reconstruct(draw8.filter((m) => !(m.round === 2 && m.key1 === "E")))).toBeNull();
    expect(reconstruct([...draw8, { key1: "B", key2: "D", winner: 1, round: 2 }])).toBeNull();
    expect(reconstruct([])).toBeNull();
  });
});

describe("winChances", () => {
  it("is uniform with coin flips and sums to 1", () => {
    const tree = reconstruct(draw8)!;
    const chances = winChances(tree, () => 0.5);
    for (const k of entrants(tree)) expect(chances.get(k)).toBeCloseTo(1 / 8);
    expect([...chances.values()].reduce((s, x) => s + x, 0)).toBeCloseTo(1);
  });

  it("matches a hand calculation for a 4-player draw", () => {
    const tree = reconstruct([
      { key1: "A", key2: "B", winner: 1, round: 1 },
      { key1: "C", key2: "D", winner: 1, round: 1 },
      { key1: "A", key2: "C", winner: 1, round: 2 },
    ])!;
    // A is a 70% favourite against everyone; everyone else is even.
    const p = (x: string, y: string) => (x === "A" ? 0.7 : y === "A" ? 0.3 : 0.5);
    const c = winChances(tree, p);
    expect(c.get("A")).toBeCloseTo(0.7 * 0.7);
    expect(c.get("B")).toBeCloseTo(0.3 * 0.5);
    expect([...c.values()].reduce((s, x) => s + x, 0)).toBeCloseTo(1);
  });
});

describe("seededBracket and reachChances", () => {
  it("seeds 1 v 8, 4 v 5, 2 v 7, 3 v 6 and keeps 1 and 2 apart until the final", () => {
    const tree = seededBracket(["S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8"])!;
    expect(entrants(tree)).toEqual(["S1", "S8", "S4", "S5", "S2", "S7", "S3", "S6"]);
    expect(seededBracket(["A", "B", "C"])).toBeNull();
  });

  it("reach chances: certain at the start, consistent with winChances at the end", () => {
    const tree = seededBracket(["A", "B", "C", "D"])!;
    const p = (x: string, y: string) => (x === "A" ? 0.7 : y === "A" ? 0.3 : 0.5);
    const reach = reachChances(tree, p);
    const title = winChances(tree, p);
    for (const [k, arr] of reach) {
      expect(arr[0]).toBe(1);
      expect(arr).toHaveLength(3);
      expect(arr[2]).toBeCloseTo(title.get(k)!);
    }
    expect(reach.get("A")![1]).toBeCloseTo(0.7);
  });
});
