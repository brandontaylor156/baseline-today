import { describe, expect, it } from "vitest";

import { rng } from "./forecast";
import { comebackCurves, findReturns, playingDays, ratingShift, type ComebackMatch } from "./comebacks";

describe("findReturns", () => {
  it("finds gaps of eight weeks or more and the events after them", () => {
    const m = (tid: number, date: string): ComebackMatch => ({ key: "a", tournamentId: tid, startDate: date, p: 0.5, won: true });
    const r = findReturns([m(1, "2024-01-01"), m(2, "2024-01-08"), m(3, "2024-04-01"), m(3, "2024-04-01"), m(4, "2024-04-08")]);
    expect(r).toHaveLength(1);
    expect(r[0].gap).toBe(84);
    expect(r[0].events.map((e) => e.length)).toEqual([2, 1]);
  });
});

describe("ratingShift", () => {
  it("is zero when results match the chances and recovers a planted shift", () => {
    expect(ratingShift([[0.5, true], [0.5, false]]).shift).toBeCloseTo(0);
    const rand = rng(5);
    const ms: [number, boolean][] = [];
    for (let i = 0; i < 20000; i++) {
      const p = 0.2 + rand() * 0.6;
      const truth = 1 / (1 + ((1 - p) / p) * 10 ** (50 / 400)); // 50 points worse
      ms.push([p, rand() < truth]);
    }
    const s = ratingShift(ms);
    expect(s.shift).toBeGreaterThan(-60);
    expect(s.shift).toBeLessThan(-40);
    expect(s.se).toBeGreaterThan(1);
    expect(s.se).toBeLessThan(10);
  });
});

describe("comebackCurves", () => {
  it("buckets returns by gap length", () => {
    const curves = comebackCurves([{ key: "a", date: "2024-04-01", gap: 84, events: [[[0.5, false]]] }]);
    expect(curves["8-16"][0].matches).toBe(1);
    expect(curves["26+"][0].matches).toBe(0);
  });
});

describe("playingDays", () => {
  it("leaves out the off-season and the 2020 suspension", () => {
    expect(playingDays("2024-03-04", "2024-03-11")).toBe(7);
    expect(playingDays("2024-11-04", "2025-01-06")).toBe(16 + 5); // 4–20 Nov, 1–6 Jan
    expect(playingDays("2020-03-02", "2020-08-24")).toBe(14 + 14);
  });
  it("keeps a winless player's shift finite with a prior", () => {
    expect(Math.abs(ratingShift([[0.6, false], [0.6, false]], 150).shift)).toBeLessThan(300);
  });
});
