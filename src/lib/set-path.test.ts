import { describe, expect, it } from "vitest";

import { matchModel, serveModelFor } from "./live-prob";
import { SCORELINE_PARAMS } from "./scorelines";
import { lowestForWinner, nextSetChance, setPath } from "./set-path";

const P = SCORELINE_PARAMS.atp;

describe("setPath", () => {
  it("starts at the pre-match chance and ends at the result", () => {
    const path = setPath(0.7, 3, P, [2, 1, 1]);
    expect(path[0]).toBe(0.7);
    expect(path).toHaveLength(4);
    expect(path.at(-1)).toBe(1);
    expect(path[1]).toBeLessThan(0.7); // lost the first set
    expect(path[2]).toBeGreaterThan(path[1]);
  });

  it("learns from the sets: losing the first set hurts more than the score alone says", () => {
    const withForm = setPath(0.7, 3, P, [2])[1];
    const m = matchModel(serveModelFor(0.7, 3, P.average));
    const scoreOnly = m.match(0, 1);
    expect(withForm).toBeLessThan(scoreOnly);
  });

  it("is symmetric between the players", () => {
    const a = setPath(0.6, 5, P, [1, 2]);
    const b = setPath(0.4, 5, P, [2, 1]);
    a.forEach((x, i) => expect(x).toBeCloseTo(1 - b[i], 2));
  });

  it("finds the winner's low point", () => {
    expect(lowestForWinner([0.7, 0.4, 0.75, 1], 1)).toBeCloseTo(0.4);
    expect(lowestForWinner([0.7, 0.4, 0.75, 0], 2)).toBeCloseTo(0.25);
  });
});

describe("nextSetChance", () => {
  it("rises after winning a set (form) and is symmetric", () => {
    const before = nextSetChance(0.5, 3, P, []);
    expect(before).toBeCloseTo(0.5, 3);
    expect(nextSetChance(0.5, 3, P, [1])).toBeGreaterThan(0.5);
    expect(nextSetChance(0.6, 3, P, [1])).toBeCloseTo(1 - nextSetChance(0.4, 3, P, [2]), 6);
  });
});
