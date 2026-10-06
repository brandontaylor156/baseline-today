import { describe, expect, it } from "vitest";

import { curveAt, peakAge, project, rankAmong } from "./aging";

const curve = [
  { age: 20, mean: 1700 },
  { age: 22, mean: 1800 },
  { age: 26, mean: 1900 },
  { age: 30, mean: 1850 },
];

describe("aging", () => {
  it("interpolates and holds at the ends", () => {
    expect(curveAt(curve, 21)).toBe(1750);
    expect(curveAt(curve, 18)).toBe(1700);
    expect(curveAt(curve, 35)).toBe(1850);
    expect(curveAt([], 20)).toBeNull();
  });
  it("projects along the average change and finds the peak", () => {
    expect(project(2000, 20, 2, curve)).toBe(2100);
    expect(project(2000, 28, 2, curve)).toBe(1975);
    expect(peakAge(curve)).toBe(26);
  });
  it("ranks a rating in a field", () => {
    expect(rankAmong(2100, [2200, 2050, 1900])).toBe(2);
    expect(rankAmong(2300, [2200])).toBe(1);
  });
});
