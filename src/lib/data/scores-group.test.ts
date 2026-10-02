import { describe, expect, it } from "vitest";

import { groupMatches, isStale, sortMatches, statusLabel, type ScoreMatch } from "./scores-group";

function match(id: number, over: Partial<ScoreMatch> = {}): ScoreMatch {
  return {
    id,
    tour: "atp",
    tournament: { id: 1, name: "Shanghai", category: "Masters 1000" },
    round: "R32",
    status: "scheduled",
    resultDetail: null,
    isLive: false,
    sets: [],
    p1Game: null,
    p2Game: null,
    server: null,
    scheduledAt: "2026-10-12T04:00:00Z",
    notBefore: null,
    player1: null,
    player2: null,
    winner: null,
    ...over,
  };
}

describe("sortMatches", () => {
  it("orders live, in progress, upcoming by time, then finished latest first", () => {
    const sorted = sortMatches([
      match(1, { status: "final", scheduledAt: "2026-10-12T01:00:00Z" }),
      match(2, { status: "scheduled", scheduledAt: "2026-10-12T09:00:00Z" }),
      match(3, { isLive: true, status: "in_progress" }),
      match(4, { status: "final", scheduledAt: "2026-10-12T03:00:00Z" }),
      match(5, { status: "scheduled", scheduledAt: "2026-10-12T05:00:00Z" }),
      match(6, { status: "suspended" }),
    ]);
    expect(sorted.map((m) => m.id)).toEqual([3, 6, 5, 2, 4, 1]);
  });
});

describe("groupMatches", () => {
  it("puts tournaments with live matches first, then by level", () => {
    const groups = groupMatches([
      match(1, { tournament: { id: 1, name: "Shanghai", category: "Masters 1000" } }),
      match(2, { tour: "wta", tournament: { id: 2, name: "Mallorca", category: "WTA 125" }, isLive: true }),
      match(3, { tour: "wta", tournament: { id: 3, name: "Wuhan", category: "WTA 1000" } }),
    ]);
    expect(groups.map((g) => [g.name, g.live])).toEqual([
      ["Mallorca", 1],
      ["Shanghai", 0],
      ["Wuhan", 0],
    ]);
  });
});

describe("statusLabel", () => {
  it("labels live and finished detail", () => {
    expect(statusLabel({ isLive: true, status: "in_progress", resultDetail: null })).toBe("Live");
    expect(statusLabel({ isLive: false, status: "final", resultDetail: "retired" })).toBe("Retired");
    expect(statusLabel({ isLive: false, status: "unknown", resultDetail: null })).toBe("Scheduled");
  });
});

describe("isStale", () => {
  const now = new Date("2026-10-12T04:00:00Z");
  it("uses the short threshold while matches are live", () => {
    expect(isStale("2026-10-12T03:57:30Z", true, now, 120, 900)).toBe(true);
    expect(isStale("2026-10-12T03:57:30Z", false, now, 120, 900)).toBe(false);
    expect(isStale(null, false, now, 120, 900)).toBe(true);
  });
});
