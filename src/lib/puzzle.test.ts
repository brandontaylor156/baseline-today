import { describe, expect, it } from "vitest";

import { ageOn, compare, normalizeHand, pickAnswer, puzzleNumber, shareText, tourForDay, type PuzzlePlayer } from "./puzzle";

const p = (over: Partial<PuzzlePlayer>): PuzzlePlayer => ({ id: 1, name: "A", tour: "atp", country: "ITA", age: 25, rank: 5, heightCm: 191, hand: "right", ...over });

describe("puzzle days", () => {
  it("numbers days from the start and alternates tours", () => {
    expect(puzzleNumber("2026-10-06")).toBe(1);
    expect(puzzleNumber("2026-10-07")).toBe(2);
    expect(tourForDay("2026-10-06")).toBe("atp");
    expect(tourForDay("2026-10-07")).toBe("wta");
  });

  it("picks the same answer for a day whatever the pool order", () => {
    const pool = [{ id: 3 }, { id: 1 }, { id: 2 }];
    expect(pickAnswer("2026-10-06", pool)).toEqual(pickAnswer("2026-10-06", [...pool].reverse()));
    expect(pickAnswer("2026-10-06", [])).toBeNull();
  });
});

describe("compare", () => {
  it("marks matches, near misses and directions", () => {
    const answer = p({ id: 9, country: "ESP", age: 23, rank: 2, heightCm: 183, hand: "right" });
    const f = compare(p({ id: 1, country: "ITA", age: 25, rank: 1, heightCm: 191, hand: "right" }), answer);
    expect(f.correct).toBe(false);
    expect(f.country).toEqual({ result: "miss" });
    expect(f.age).toEqual({ result: "close", dir: "down" });
    expect(f.rank).toEqual({ result: "close", dir: "down" }); // answer ranked lower (2 vs 1)
    expect(f.height).toEqual({ result: "miss", dir: "down" });
    expect(f.hand).toEqual({ result: "match" });
    expect(compare(answer, answer).correct).toBe(true);
  });

  it("treats missing data as unknown", () => {
    expect(compare(p({ heightCm: null }), p({ id: 2 })).height).toEqual({ result: "unknown" });
  });
});

describe("helpers", () => {
  it("ages, hands and the share grid", () => {
    expect(ageOn("2001-08-16", "2026-10-06")).toBe(25);
    expect(ageOn("2001-12-16", "2026-10-06")).toBe(24);
    expect(normalizeHand("Left-Handed, Two-Handed Backhand")).toBe("left");
    const rows = [compare(p({}), p({ id: 2, country: "ESP" })), compare(p({ id: 2 }), p({ id: 2 }))];
    expect(shareText("2026-10-06", rows, true)).toBe("Baseline Today Guess the Player #1 2/6\n⬛🟩🟩🟩🟩\n🟩🟩🟩🟩🟩");
  });
});
