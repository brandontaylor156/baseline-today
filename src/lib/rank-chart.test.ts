import { describe, expect, it } from "vitest";

import { monthTicks, nearestIndex, rankDomain, rankTicks, segments } from "./rank-chart";

const p = (date: string, rank: number) => ({ date, rank, points: null });

describe("rank chart geometry", () => {
  it("breaks the line where the player dropped out of the top 100", () => {
    const tour = ["2026-01-05", "2026-01-12", "2026-01-19", "2026-01-26", "2026-02-02"];
    const runs = segments([p("2026-01-05", 90), p("2026-01-12", 95), p("2026-01-26", 99), p("2026-02-02", 97)], tour);
    expect(runs.map((r) => r.map((x) => x.date))).toEqual([
      ["2026-01-05", "2026-01-12"],
      ["2026-01-26", "2026-02-02"],
    ]);
  });

  it("does not break across weeks the tour skipped", () => {
    const tour = ["2026-01-05", "2026-01-19"]; // no ranking published on 01-12
    expect(segments([p("2026-01-05", 3), p("2026-01-19", 2)], tour)).toHaveLength(1);
  });

  it("picks a clean rank domain and ticks", () => {
    expect(rankDomain([p("2026-01-05", 1), p("2026-01-12", 3)])).toEqual([1, 5]);
    expect(rankDomain([p("2026-01-05", 37)])).toEqual([1, 50]);
    expect(rankTicks([1, 50])).toEqual([1, 10, 25, 50]);
    expect(rankTicks([1, 100])[0]).toBe(1);
    expect(rankTicks([1, 100]).length).toBeLessThanOrEqual(5);
  });

  it("thins month ticks", () => {
    expect(monthTicks("2025-01-06", "2025-04-28")).toEqual(["2025-02-01", "2025-03-01", "2025-04-01"]);
    expect(monthTicks("2025-01-06", "2026-09-28").length).toBeLessThanOrEqual(6);
  });

  it("finds the nearest point to the pointer", () => {
    const pts = [p("2026-01-05", 1), p("2026-01-12", 2), p("2026-01-19", 3)];
    expect(nearestIndex(pts, Date.parse("2026-01-13T00:00:00Z"))).toBe(1);
  });
});
