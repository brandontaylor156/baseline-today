import { describe, expect, it } from "vitest";

import { arbitrage, expectedValue, fairMarket, impliedChance, kelly, parlay, parseOdds, toAmerican, toFractional } from "./bet-math";

describe("parseOdds", () => {
  it("reads decimal, American and fractional odds", () => {
    expect(parseOdds("1.85")).toBeCloseTo(1.85);
    expect(parseOdds("+150")).toBeCloseTo(2.5);
    expect(parseOdds("-120")).toBeCloseTo(1.8333, 3);
    expect(parseOdds("5/2")).toBeCloseTo(3.5);
    expect(parseOdds(" 1/4 ")).toBeCloseTo(1.25);
  });
  it("rejects nonsense", () => {
    for (const bad of ["", "abc", "1", "0.9", "+50", "5/0", "--120"]) expect(parseOdds(bad), bad).toBeNull();
  });
});

describe("formats", () => {
  it("converts back to American and fractional", () => {
    expect(toAmerican(2.5)).toBe("+150");
    expect(toAmerican(1.5)).toBe("-200");
    expect(toFractional(3.5)).toBe("5/2");
    expect(toFractional(1.5)).toBe("1/2");
  });
});

describe("market maths", () => {
  it("removes the margin from a two-way market", () => {
    const m = fairMarket([1.9, 1.9]);
    expect(m.margin).toBeCloseTo(0.0526, 3);
    expect(m.fair[0]).toBeCloseTo(0.5);
    expect(m.fairOdds[0]).toBeCloseTo(2);
    expect(impliedChance(2)).toBe(0.5);
  });

  it("expected value and Kelly", () => {
    expect(expectedValue(2.2, 0.5)).toBeCloseTo(0.1);
    expect(expectedValue(1.8, 0.5)).toBeCloseTo(-0.1);
    expect(kelly(2.2, 0.5)).toBeCloseTo(0.0833, 3);
    expect(kelly(1.8, 0.5)).toBe(0);
  });

  it("parlays multiply", () => {
    const p = parlay([1.5, 2, 1.8]);
    expect(p.odds).toBeCloseTo(5.4);
    expect(p.chance).toBeCloseTo(1 / 5.4);
  });

  it("arbitrage splits stakes for an equal return", () => {
    const a = arbitrage([2.1, 2.1], 100);
    expect(a.arb).toBe(true);
    expect(a.stakes[0]).toBeCloseTo(50);
    expect(a.payout).toBeCloseTo(105);
    expect(arbitrage([1.9, 1.9], 100).arb).toBe(false);
  });
});
