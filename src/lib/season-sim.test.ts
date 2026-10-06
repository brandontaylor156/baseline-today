import { describe, expect, it } from "vitest";

import { rng } from "@/lib/lab/forecast";

import { drawLines, playDraw, playFinals, seedsFor, simulateSeason, type SimPlayer } from "./season-sim";

const keys = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);

describe("drawLines", () => {
  it("gives byes to the top seeds and keeps 1 and 2 in opposite halves", () => {
    const line = drawLines(keys(28), 5, rng(1));
    expect(line).toHaveLength(32);
    expect(line.filter((x) => x === "bye")).toHaveLength(4);
    for (const s of ["p1", "p2", "p3", "p4"]) {
      const i = line.indexOf(s);
      expect(line[i % 2 === 0 ? i + 1 : i - 1]).toBe("bye");
    }
    expect(line.indexOf("p1") < 16).not.toBe(line.indexOf("p2") < 16);
    expect(new Set(line.filter((x) => x !== "bye")).size).toBe(28);
  });

  it("seeds a quarter of the draw", () => {
    expect(seedsFor(128)).toBe(32);
    expect(seedsFor(32)).toBe(8);
    expect(seedsFor(96)).toBe(16); // the 32 byes push the seeding to 32 in drawLines
    const line = drawLines(keys(96), 7, rng(2));
    expect(line.filter((x) => x === "bye")).toHaveLength(32);
  });
});

describe("playDraw", () => {
  it("counts a bye as a win and crowns one champion", () => {
    const { wins, bye } = playDraw(["a", "bye", "b", "c"], (x) => (x === "a" ? 1 : 0.5), rng(3));
    expect(wins.get("a")).toBe(2);
    expect(bye.has("a")).toBe(true);
    expect([...wins.values()].filter((w) => w === 2)).toHaveLength(1);
  });
});

describe("playFinals", () => {
  it("awards 1500 to an unbeaten champion", () => {
    const q = keys(8);
    const pts = playFinals(q, (a) => (a === "p1" ? 1 : 0.5), rng(4));
    expect(pts.get("p1")).toBe(1500);
    expect([...pts.values()].reduce((a, b) => a + b, 0)).toBe(12 * 200 + 2 * 400 + 500);
  });
});

describe("simulateSeason", () => {
  const player = (key: string, rank: number, race: number, ranking: number, extra: Partial<SimPlayer> = {}): SimPlayer => ({
    key,
    rank,
    race,
    ranking,
    live: [],
    liveBanked: 0,
    drops: {},
    entry: { m: 1 },
    ...extra,
  });
  const events = [{ key: "m", week: "2026-10-05", category: "Masters 1000", rounds: 5, drawSize: 32 }];

  it("decides No. 1 from the points still to play and to drop", () => {
    // A leads by 500 but drops 1000 from last year's edition; B has nothing to drop.
    const players = [player("A", 1, 9000, 10000, { drops: { m: 1000 } }), player("B", 2, 8500, 9500), ...keys(10).map((k, i) => player(k, i + 3, 3000 - i, 3000 - i))];
    const out = simulateSeason({ tour: "atp", players, events, chance: (a, b) => (a === "B" ? 0.95 : b === "B" ? 0.05 : 0.5), finals: null, sims: 300 });
    const b = out.find((o) => o.key === "B")!;
    expect(b.no1).toBeGreaterThan(0.9);
    expect(out.reduce((s, o) => s + o.no1, 0)).toBeCloseTo(1);
  });

  it("sends the top of the race to the finals", () => {
    const players = keys(12).map((k, i) => player(k, i + 1, 5000 - i * 300, 5000 - i * 300, { entry: {} }));
    const out = simulateSeason({ tour: "atp", players, events, chance: () => 0.5, finals: { spots: 8, drop: {} }, sims: 50 });
    expect(out.find((o) => o.key === "p8")!.finals).toBe(1);
    expect(out.find((o) => o.key === "p9")!.finals).toBe(0);
    expect(out.reduce((s, o) => s + o.finals, 0)).toBeCloseTo(8);
  });
});
