import { describe, expect, it } from "vitest";

import { matchModel, serveModelFor } from "./live-prob";
import { formNodes, mixScorelines, scorelines, setScores } from "./scorelines";

describe("setScores", () => {
  it("sums to one and agrees with the set chance", () => {
    const m = serveModelFor(0.7, 3, 0.63);
    for (const first of [0, 1] as const) {
      const d = setScores(m, first);
      expect(d.reduce((s, o) => s + o.p, 0)).toBeCloseTo(1, 10);
      const won = d.filter((o) => o.a > o.b).reduce((s, o) => s + o.p, 0);
      expect(won).toBeCloseTo(matchModel(m).set(0, 0, first), 10);
    }
  });
});

describe("scorelines", () => {
  it("reproduces the match chance and gives sensible shapes", () => {
    const m = serveModelFor(0.7, 3, 0.63);
    const s = scorelines(m);
    expect(s.sets.reduce((t, o) => t + o.p, 0)).toBeCloseTo(1, 8);
    const won = s.sets.filter((o) => o.a > o.b).reduce((t, o) => t + o.p, 0);
    expect(won).toBeCloseTo(0.7, 3);
    expect(s.sets[0]).toMatchObject({ a: 2, b: 0 });
    expect(s.meanGames).toBeGreaterThan(18);
    expect(s.meanGames).toBeLessThan(28);
    expect(s.tiebreak).toBeGreaterThan(0.1);
    expect(s.tiebreak).toBeLessThan(0.6);
  });

  it("handles best of five", () => {
    const s = scorelines(serveModelFor(0.5, 5, 0.63));
    expect(s.sets.map((o) => `${o.a}-${o.b}`).sort()).toEqual(["0-3", "1-3", "2-3", "3-0", "3-1", "3-2"]);
    expect(s.sets.find((o) => o.a === 3 && o.b === 2)!.p).toBeCloseTo(s.sets.find((o) => o.a === 2 && o.b === 3)!.p, 2);
  });
});

describe("match-day form", () => {
  it("keeps the match chance and makes straight sets more likely", () => {
    const nodes = formNodes(0.7, 1);
    expect(nodes.reduce((s, n) => s + n.w * n.p, 0)).toBeCloseTo(0.7, 6);
    const flat = scorelines(serveModelFor(0.7, 3, 0.62));
    const mixed = mixScorelines(nodes.map((n) => ({ s: scorelines(serveModelFor(n.p, 3, 0.62)), w: n.w })));
    const straight = (s: typeof flat) => s.sets.filter((o) => Math.min(o.a, o.b) === 0).reduce((t, o) => t + o.p, 0);
    expect(straight(mixed)).toBeGreaterThan(straight(flat));
    expect(mixed.sets.filter((o) => o.a > o.b).reduce((t, o) => t + o.p, 0)).toBeCloseTo(0.7, 2);
  });
});
