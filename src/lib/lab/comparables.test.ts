import { describe, expect, it } from "vitest";

import { backtest, fieldLevels, project, relAt, type Series } from "./comparables";

/** A player rated every 4 weeks from 2015 to 2026, rating = f(age). */
function player(key: string, birth: string, f: (age: number) => number, from = "2015-01-05", to = "2026-09-28"): Series {
  const weeks: Series["weeks"] = [];
  for (let d = Date.parse(`${from}T00:00:00Z`); d <= Date.parse(`${to}T00:00:00Z`); d += 28 * 86_400_000) {
    const week = new Date(d).toISOString().slice(0, 10);
    weeks.push({ week, overall: f((d - Date.parse(`${birth}T00:00:00Z`)) / (365.25 * 86_400_000)) });
  }
  return { key, birth, weeks };
}

const flatField = new Map(Array.from({ length: 12 }, (_, i) => [2015 + i, 1500]));

describe("relAt", () => {
  it("reads the latest week within half a year of the age, relative to the field", () => {
    const s = player("a", "2000-01-01", () => 1700);
    expect(relAt(s, 20, flatField)).toBe(200);
    expect(relAt(s, 12, flatField)).toBeNull(); // before their first week
    expect(relAt(s, 26, flatField, "2024-06-01")).toBeNull(); // nothing that late before the cutoff
  });
});

describe("fieldLevels", () => {
  it("averages the best season ratings", () => {
    const levels = fieldLevels([player("a", "2000-01-01", () => 1600), player("b", "2000-01-01", () => 1400)]);
    expect(levels.get(2020)).toBeCloseTo(1500);
  });
});

describe("project", () => {
  // Earlier players who all rose 100 a year from age 18 to 24 (born 1996–2001, so they're past it).
  const risers = Array.from({ length: 12 }, (_, i) => player(`r${i}`, `${1996 + (i % 6)}-0${1 + (i % 9)}-15`, (a) => 1500 + 100 * Math.min(Math.max(a - 18, 0), 6) + i));
  // Earlier players already at their peak at 20, who fell after.
  const fallers = Array.from({ length: 12 }, (_, i) => player(`f${i}`, `${1996 + (i % 6)}-0${1 + (i % 9)}-15`, (a) => 2100 - 50 * Math.max(a - 20, 0) + i));
  const target = player("t", "2005-06-01", (a) => 1500 + 100 * Math.min(Math.max(a - 18, 0), 6));
  const all = [...risers, ...fallers, target];

  it("matches the players on the same path and projects their next years", () => {
    const p = project(target, all, flatField, "2026-09-28", undefined, 10)!;
    expect(p.age).toBeCloseTo(21.3, 1);
    expect(p.comps.every((c) => c.key.startsWith("r"))).toBe(true);
    expect(p.in1!.mid).toBeCloseTo(100, -1);
    expect(p.in2!.mid).toBeCloseTo(200, -1);
  });

  it("needs two years of history and a recent week", () => {
    const rookie = player("n", "2006-01-01", () => 1600, "2026-03-02");
    expect(project(rookie, all, flatField, "2026-09-28")).toBeNull();
    const retired = player("o", "1990-01-01", () => 1600, "2015-01-05", "2020-01-06");
    expect(project(retired, all, flatField, "2026-09-28")).toBeNull();
  });
});

describe("backtest", () => {
  it("beats no-change when careers follow a shared curve, and never peeks past the cutoff", () => {
    const curve = (a: number) => 1500 + 300 * Math.exp(-((a - 25) ** 2) / 18);
    const all = Array.from({ length: 40 }, (_, i) => player(`p${i}`, `${1988 + (i % 15)}-0${1 + (i % 9)}-10`, (a) => curve(a) + (i % 5) * 10));
    const b = backtest(all, flatField, "2023-01-02");
    expect(b.players).toBeGreaterThan(10);
    expect(b.error).toBeLessThan(b.baseline);
  });
});
