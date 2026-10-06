import { describe, expect, it } from "vitest";

import { expectedWins, fitExponent, nextSeasonTest, type SeasonLine } from "./pythagorean";

const line = (key: string, season: number, share: number, winRate: number): SeasonLine => ({
  key,
  season,
  wins: Math.round(winRate * 50),
  matches: 50,
  gamesWon: Math.round(share * 1000),
  gamesPlayed: 1000,
});

describe("pythagorean", () => {
  it("fits the exponent that maps game share to win share", () => {
    const k = 8;
    const lines = [0.45, 0.48, 0.5, 0.52, 0.55, 0.58].map((g, i) => line(`p${i}`, 2020, g, expectedWins(g, k)));
    expect(fitExponent(lines)).toBeCloseTo(k, 0);
    expect(expectedWins(0.5, k)).toBeCloseTo(0.5);
    expect(expectedWins(0.55, k)).toBeGreaterThan(0.75);
  });

  it("finds that games predict next season better when records are noisy", () => {
    // Skill = game share; records = skill plus season-specific luck that doesn't repeat.
    const lines: SeasonLine[] = [];
    for (let i = 0; i < 40; i++) {
      const g = 0.44 + (i % 10) * 0.015;
      const luck = ((i * 7) % 5) * 0.04 - 0.08;
      lines.push(line(`p${i}`, 2020, g, Math.min(0.95, Math.max(0.05, expectedWins(g, 8) + luck))));
      lines.push(line(`p${i}`, 2021, g, Math.min(0.95, Math.max(0.05, expectedWins(g, 8) - luck))));
    }
    const t = nextSeasonTest(lines, 8);
    expect(t.pairs).toBe(40);
    expect(t.fromGames).toBeGreaterThan(t.fromRecord);
    expect(t.luckCarries).toBeLessThan(0);
  });
});
