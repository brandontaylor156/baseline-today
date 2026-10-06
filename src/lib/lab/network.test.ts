import { describe, expect, it } from "vitest";

import { pageRank, winChain, type Win } from "./network";

describe("pageRank", () => {
  it("credits beating the players who beat everyone", () => {
    // a beats everyone; b beats c and d; c beats d; d beats nobody.
    const wins: Win[] = [
      { winner: "a", loser: "b" },
      { winner: "a", loser: "c" },
      { winner: "a", loser: "d" },
      { winner: "b", loser: "c" },
      { winner: "b", loser: "d" },
      { winner: "c", loser: "d" },
    ];
    const r = pageRank(wins);
    expect(r.get("a")!).toBeGreaterThan(r.get("b")!);
    expect(r.get("b")!).toBeGreaterThan(r.get("c")!);
    expect(r.get("c")!).toBeGreaterThan(r.get("d")!);
    expect([...r.values()].reduce((s, x) => s + x, 0)).toBeCloseTo(1, 6);
  });
});

describe("winChain", () => {
  const wins: Win[] = [
    { winner: "a", loser: "x", matchId: 1 },
    { winner: "x", loser: "y", matchId: 2 },
    { winner: "y", loser: "b", matchId: 3 },
    { winner: "a", loser: "z", matchId: 4 },
  ];
  it("finds the shortest chain of real wins", () => {
    expect(winChain(wins, "a", "b")!.map((w) => w.matchId)).toEqual([1, 2, 3]);
  });
  it("respects direction and the step limit", () => {
    expect(winChain(wins, "b", "a")).toBeNull();
    expect(winChain(wins, "a", "b", 2)).toBeNull();
    expect(winChain(wins, "a", "a")).toEqual([]);
  });
});
