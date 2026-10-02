import { describe, expect, it } from "vitest";

import type { SeasonMatch } from "./leaders";
import { raceTable, roundNumber, roundsFor, type RaceEvent } from "./race";

let id = 1;
const P = (k: string) => ({ key: k, id: null, name: k.toUpperCase(), country: null });
function match(tournamentId: number, round: string, a: string, b: string, winner: 1 | 2 = 1): SeasonMatch {
  return {
    id: id++,
    season: 2026,
    date: "2026-01-01",
    roundRank: 0,
    round,
    surface: "Hard",
    bestOf: 3,
    side: 1,
    winner,
    walkover: false,
    retired: false,
    sets: [],
    tour: "atp",
    tournamentId,
    tournamentName: `T${tournamentId}`,
    p1: P(a),
    p2: P(b),
    preMatchP1: null,
  };
}

describe("roundNumber", () => {
  it("maps labels to round numbers", () => {
    expect(roundsFor(96)).toBe(7);
    expect(roundsFor(28)).toBe(5);
    expect([roundNumber("First round", 5), roundNumber("Quarterfinals", 5), roundNumber("Final", 5)]).toEqual([1, 3, 5]);
  });
});

describe("raceTable", () => {
  // ATP 250, 32-draw (5 rounds): "a" wins the title; "b" loses the final; "c" loses in round 1.
  const events = new Map<number, RaceEvent>([
    [1, { tour: "atp", category: "ATP 250", rounds: 5 }],
    [2, { tour: "atp", category: "Masters 1000", rounds: 7 }],
  ]);
  const matches = [
    match(1, "First round", "a", "c"),
    match(1, "Semifinals", "a", "d"),
    match(1, "Final", "a", "b"),
    // Masters in progress: "b" had a bye and won round 2.
    match(2, "Second round", "b", "e"),
  ];

  it("banks points for finished runs (robust to missing rounds)", () => {
    const rows = raceTable(matches.slice(0, 3), events, new Map());
    const by = new Map(rows.map((r) => [r.key, r]));
    expect(by.get("a")!.points).toBe(250);
    expect(by.get("b")!.points).toBe(165);
    expect(by.get("c")!.points).toBe(0);
    expect(by.get("d")!.points).toBe(100);
  });

  it("projects from live chances, never below what's banked", () => {
    const reach = new Map([
      ["b", [1, 1, 1, 0.5, 0.25, 0.1, 0.05, 0.02]],
      ["e", [1, 1, 0, 0, 0, 0, 0, 0]],
    ]);
    const rows = raceTable(matches, events, new Map([[2, { reach, players: [] }]]));
    const b = rows.find((r) => r.key === "b")!;
    // Banked: 165 (final at the 250) + round-3 exit at the Masters (50).
    expect(b.points).toBe(165 + 50);
    expect(b.projected).toBeGreaterThan(b.points);
    expect(rows.find((r) => r.key === "e")!.points).toBe(10); // lost first match after a bye
  });
});
