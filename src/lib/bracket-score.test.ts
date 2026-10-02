import { describe, expect, it } from "vitest";

import { pickStats, type SettledPick } from "./badges";
import { pointsForRound, scoreBracket } from "./bracket-score";
import type { DrawModel } from "./draw-model";

const player = (key: string, position: number) => ({ key, id: null, name: key, countryCode: null, seed: null, position, rating: null });
const model = (played: { winner: string; loser: string }[]): DrawModel => ({
  tournamentId: 1,
  size: 4,
  rounds: 2,
  surface: null,
  calibration: 1,
  players: ["a", "b", "c", "d"].map(player),
  played,
});

// Full bracket: a beats b, c beats d, a beats c.
const picks = [
  { winner: "a", loser: "b" },
  { winner: "c", loser: "d" },
  { winner: "a", loser: "c" },
];

describe("scoreBracket", () => {
  it("weights rounds equally", () => {
    expect([1, 2, 3].map(pointsForRound)).toEqual([10, 20, 40]);
  });

  it("before any result: nothing scored, everything possible", () => {
    expect(scoreBracket(model([]), picks)).toEqual({ score: 0, max: 40, correct: 0 });
  });

  it("scores right picks and drops what can no longer happen", () => {
    // a won; d beat c, so the c–d pick is wrong and the final pick (a over c) still scores if a wins.
    const r = scoreBracket(model([{ winner: "a", loser: "b" }, { winner: "d", loser: "c" }]), picks);
    expect(r).toEqual({ score: 10, max: 30, correct: 1 });
  });

  it("ignores two picks for the same slot", () => {
    const r = scoreBracket(model([{ winner: "a", loser: "b" }]), [{ winner: "a", loser: "b" }, { winner: "b", loser: "a" }]);
    expect(r.score).toBe(0);
  });
});

describe("pickStats", () => {
  const p = (side: 1 | 2, winner: 1 | 2, p1: number | null, day: string): SettledPick => ({ side, winner, p1, settledAt: `${day}T12:00:00Z` });

  it("tracks streaks and earns badges", () => {
    const picks = [
      p(1, 2, 0.6, "2026-09-01"),
      ...Array.from({ length: 5 }, () => p(1, 1, 0.7, "2026-09-02")),
      p(2, 2, 0.9, "2026-09-03"), // picked a 10% player and was right
    ];
    const s = pickStats(picks);
    expect(s.correct).toBe(6);
    expect(s.currentStreak).toBe(6);
    expect(s.bestStreak).toBe(6);
    expect(s.badges.map((b) => b.id)).toEqual(["first", "streak5", "upset", "slayer", "perfect"]);
  });
});
