import { describe, expect, it } from "vitest";

import { trackRecord, type ScoredMatch } from "./track-record";

const m = (id: number, r1: number | null, r2: number | null, p1Chance: number, winner: 1 | 2): ScoredMatch => ({
  id,
  tournament: "T",
  round: null,
  p1: { id: id * 10 + 1, name: `A${id}`, rank: r1 },
  p2: { id: id * 10 + 2, name: `B${id}`, rank: r2 },
  winner,
  p1Chance,
});

describe("trackRecord", () => {
  const record = trackRecord([
    m(1, 5, 50, 0.8, 1), // right, favorite was higher ranked
    m(2, 60, 10, 0.6, 1), // right, model picked the lower-ranked player
    m(3, null, 30, 0.55, 1), // right, unranked pick over #30
    m(4, 2, 80, 0.9, 2), // wrong, very confident
    m(5, 20, 25, 0.4, 1), // wrong (picked 2)
  ]);

  it("counts correct picks", () => {
    expect(record.correct).toBe(3);
    expect(record.total).toBe(5);
  });

  it("finds wins against the ranking, biggest gap first", () => {
    expect(record.beatRanking.map((c) => c.match.id)).toEqual([3, 2]);
  });

  it("lists misses, most confident first", () => {
    expect(record.misses.map((c) => [c.match.id, Math.round(c.chance * 100)])).toEqual([
      [4, 90],
      [5, 60],
    ]);
  });
});
