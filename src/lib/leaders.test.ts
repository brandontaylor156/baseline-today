import { describe, expect, it } from "vitest";

import { leaderRows, topBy, upsets, type SeasonMatch } from "./leaders";

const player = (key: string) => ({ key, id: null, name: key.toUpperCase(), country: null });
const m = (id: number, a: string, b: string, winner: 1 | 2, over: Partial<SeasonMatch> = {}): SeasonMatch => ({
  id,
  season: 2026,
  date: `2026-0${(id % 9) + 1}-01`,
  roundRank: 3,
  round: "First round",
  surface: "Hard",
  bestOf: 3,
  side: 1,
  winner,
  walkover: false,
  retired: false,
  sets: [
    { p1: 6, p2: 4 },
    { p1: 6, p2: 4 },
  ],
  tour: "atp",
  tournamentId: 1,
  tournamentName: "Test Open",
  p1: player(a),
  p2: player(b),
  preMatchP1: 0.5,
  ...over,
});

describe("leaderboards", () => {
  const matches = [m(1, "a", "b", 1), m(2, "a", "c", 1, { round: "Final" }), m(3, "b", "c", 1), m(4, "c", "a", 1)];
  const rows = leaderRows(matches);

  it("aggregates each player's season from both sides", () => {
    const a = rows.find((r) => r.key === "a")!;
    expect([a.w, a.l, a.titles]).toEqual([2, 1, 1]);
    expect(a.pct).toBeCloseTo(2 / 3);
  });

  it("ranks by metric with a minimum for win rate", () => {
    expect(topBy(rows, "wins")[0].key).toBe("a");
    expect(topBy(rows, "pct", 10, 3).map((r) => r.key)).toEqual(["a", "b", "c"].filter((k) => rows.find((r) => r.key === k)!.w + rows.find((r) => r.key === k)!.l >= 3));
    expect(topBy(rows, "titles").map((r) => r.key)).toEqual(["a"]);
  });
});

describe("upsets", () => {
  it("lists wins the model gave the winner little chance of, most surprising first", () => {
    const list = upsets([
      m(1, "fav", "dog", 2, { preMatchP1: 0.8 }), // dog had 20%
      m(2, "fav", "dog", 1, { preMatchP1: 0.8 }), // favourite won: not an upset
      m(3, "x", "y", 1, { preMatchP1: 0.1 }), // x had 10%
      m(4, "x", "y", 1, { preMatchP1: 0.1, walkover: true }), // walkover ignored
    ]);
    expect(list.map((u) => [u.match.id, Number(u.winnerChance.toFixed(2))])).toEqual([
      [3, 0.1],
      [1, 0.2],
    ]);
  });
});
