import { describe, expect, it } from "vitest";

import { fragility, shrunk, type FragilityMatch } from "./fragility";

const m = (over: Partial<FragilityMatch>): FragilityMatch => ({ key1: "a", key2: "b", date: "2020-01-01", p1: 0.7, decider: 0.3, wentDistance: false, winner: 1, ...over });

describe("fragility", () => {
  it("counts deciding sets against expectation for the favourite only", () => {
    const f = fragility([m({ wentDistance: true }), m({ wentDistance: true }), m({}), m({ p1: 0.3, key1: "c", key2: "a" })]);
    const a = f.get("a")!;
    expect(a.matches).toBe(4); // favoured every time, from either side
    expect(a.deciders).toBe(2);
    expect(a.expected).toBeCloseTo(1.2);
    expect(a.z).toBeGreaterThan(0);
    expect(f.has("b")).toBe(false);
  });

  it("only uses matches before the cutoff, and shrinks small samples", () => {
    const f = fragility([m({ wentDistance: true }), m({ date: "2024-01-01", wentDistance: true })], "2023-01-01");
    expect(f.get("a")!.matches).toBe(1);
    expect(Math.abs(shrunk(f.get("a")))).toBeLessThan(Math.abs(f.get("a")!.z));
    expect(shrunk(undefined)).toBe(0);
  });
});
