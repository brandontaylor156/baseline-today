import { describe, expect, it } from "vitest";

import { americanToDecimal, decimalToAmerican, formatAmerican, modelEdge, noVig, summarizeMarket } from "./odds";

describe("odds maths", () => {
  it("converts American and decimal odds", () => {
    expect(americanToDecimal(-150)).toBeCloseTo(1.6667, 3);
    expect(americanToDecimal(130)).toBeCloseTo(2.3);
    expect(decimalToAmerican(2.3)).toBe(130);
    expect(decimalToAmerican(1.5)).toBe(-200);
    expect(formatAmerican(130)).toBe("+130");
  });

  it("removes the bookmaker margin", () => {
    const f = noVig(-110, -110);
    expect(f.p1).toBeCloseTo(0.5);
    expect(f.margin).toBeCloseTo(0.0476, 3);
  });

  it("finds the best price per side and the consensus fair probability", () => {
    const m = summarizeMarket([
      { vendor: "draftkings", p1: -150, p2: 125 },
      { vendor: "fanduel", p1: -140, p2: 115 },
      { vendor: "broken", p1: null, p2: 100 },
    ]);
    expect(m.books).toBe(2);
    expect(m.best1).toMatchObject({ american: -140, vendor: "fanduel" });
    expect(m.best2).toMatchObject({ american: 125, vendor: "draftkings" });
    expect(m.fair1).toBeGreaterThan(0.55);
    expect(m.fair1).toBeLessThan(0.6);
  });

  it("reports the side where the model sees more value", () => {
    const market = summarizeMarket([{ vendor: "dk", p1: -150, p2: 130 }]);
    const e = modelEdge(0.4, market)!; // market ~58% for p1; model only 40% → value on p2
    expect(e.side).toBe(2);
    expect(e.edge).toBeGreaterThan(0.15);
    expect(e.ev).toBeCloseTo(0.6 * 2.3 - 1);
    expect(modelEdge(0.5, summarizeMarket([]))).toBeNull();
  });
});
