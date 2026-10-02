import { describe, expect, it } from "vitest";

import { playerStats, winPct, type StatMatch } from "./stats";

const m = (id: number, over: Partial<StatMatch>): StatMatch => ({
  id,
  season: 2026,
  date: "2026-05-01",
  roundRank: 3,
  round: "First round",
  surface: "Hard",
  bestOf: 3,
  side: 1,
  winner: 1,
  walkover: false,
  retired: false,
  sets: [
    { p1: 6, p2: 4 },
    { p1: 6, p2: 3 },
  ],
  ...over,
});

describe("playerStats", () => {
  const stats = playerStats([
    m(1, { date: "2026-01-10", surface: "Clay", sets: [{ p1: 4, p2: 6 }, { p1: 7, p2: 6 }, { p1: 6, p2: 2 }] }), // comeback, tiebreak won, decider won
    m(2, { date: "2026-02-10", side: 2, winner: 1, sets: [{ p1: 7, p2: 6 }, { p1: 6, p2: 4 }] }), // lost as p2, tiebreak lost
    m(3, { date: "2026-03-10", round: "Final", roundRank: 9 }), // title
    m(4, { date: "2026-04-10", walkover: true, sets: [] }), // ignored
    m(5, { date: "2026-04-17", surface: "Grass", retired: true, sets: [{ p1: 3, p2: 1 }] }),
  ]);

  it("counts wins and losses by surface, ignoring walkovers", () => {
    expect(stats.overall).toEqual({ w: 3, l: 1 });
    expect(stats.bySurface).toEqual([
      { surface: "Hard", w: 1, l: 1 },
      { surface: "Clay", w: 1, l: 0 },
      { surface: "Grass", w: 1, l: 0 },
    ]);
  });

  it("counts tiebreaks, deciding sets, comebacks and titles from the player's side", () => {
    expect(stats.tiebreaks).toEqual({ w: 1, l: 1 });
    expect(stats.decidingSets).toEqual({ w: 1, l: 0 });
    expect(stats.comebacks).toBe(1);
    expect(stats.titles).toBe(1);
  });

  it("builds recent form and the current streak", () => {
    expect(stats.form).toEqual([true, true, false, true]);
    expect(stats.streak).toEqual({ won: true, length: 2 });
    expect(winPct(stats.overall)).toBeCloseTo(0.75);
    expect(winPct({ w: 0, l: 0 })).toBeNull();
  });
});
