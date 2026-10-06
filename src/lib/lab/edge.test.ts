import { describe, expect, it } from "vitest";

import { edgeOverTime } from "./edge";

const w = (week: string, overall: number) => ({ week, overall, hard: overall, clay: overall, grass: overall });

describe("edgeOverTime", () => {
  it("starts once both have ratings and carries ratings forward", () => {
    const a = [w("2020-01-06", 1500), w("2020-03-02", 1700)];
    const b = [w("2020-02-03", 1600)];
    const e = edgeOverTime(a, b);
    expect(e.map((x) => x.week)).toEqual(["2020-02-03", "2020-03-02"]);
    expect(e[0].p).toBeLessThan(0.5); // 1500 vs 1600
    expect(e[1].p).toBeGreaterThan(0.6); // 1700 vs 1600
  });
  it("is empty when they never overlap", () => {
    expect(edgeOverTime([], [w("2020-01-06", 1500)])).toEqual([]);
  });
});
