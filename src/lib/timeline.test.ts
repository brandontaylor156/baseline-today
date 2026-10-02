import { describe, expect, it } from "vitest";

import type { SeasonMatch } from "./leaders";
import { seasonTimeline } from "./timeline";

let nextId = 1;
const me = { key: "id:1", id: 1, name: "Me", country: null };
const opp = (id: number) => ({ key: `id:${id}`, id, name: `P${id}`, country: null });

function match(tournamentId: number, date: string, round: string, roundRank: number, won: boolean, opponent = 9, walkover = false): SeasonMatch {
  return {
    id: nextId++,
    season: 2026,
    date,
    roundRank,
    round,
    surface: "Hard",
    bestOf: 3,
    side: 1,
    winner: won ? 1 : 2,
    walkover,
    retired: false,
    sets: [],
    tour: "atp",
    tournamentId,
    tournamentName: `T${tournamentId}`,
    p1: me,
    p2: opp(opponent),
    preMatchP1: null,
  };
}

describe("seasonTimeline", () => {
  it("summarizes each tournament, newest first", () => {
    const rows = seasonTimeline(
      [
        match(1, "2026-01-05", "First round", 1, true),
        match(1, "2026-01-05", "Second round", 2, false, 7),
        match(2, "2026-02-01", "Semifinals", 5, true),
        match(2, "2026-02-01", "Final", 6, true),
        match(3, "2026-03-01", "First round", 1, true, 9, true),
      ],
      1,
    );
    expect(rows.map((r) => [r.tournamentId, r.w, r.l, r.reached, r.champion, r.lostTo?.name ?? null])).toEqual([
      [3, 0, 0, "First round", false, null],
      [2, 2, 0, "Final", true, null],
      [1, 1, 1, "Second round", false, "P7"],
    ]);
  });

  it("ignores other players' matches", () => {
    const other = { ...match(4, "2026-04-01", "Final", 6, true), p1: opp(5), p2: opp(6) };
    expect(seasonTimeline([other], 1)).toEqual([]);
  });
});
