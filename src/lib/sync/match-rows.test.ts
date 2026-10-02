import { describe, expect, it } from "vitest";

import { parseEspnLive } from "@/lib/trial/espn-parse";

import { activeWindow, gamesState, orientedGamesState, playersKey, scoreSignature } from "./match-rows";

describe("score signature", () => {
  const base = { status: "in_progress", score: "6-4 2-3", set_scores: [{ set: 1, p1: 6, p2: 4 }], player1_game_score: "15", player2_game_score: "0" };

  it("changes when points, games or status change", () => {
    expect(scoreSignature(base)).toBe(scoreSignature({ ...base }));
    expect(scoreSignature(base)).not.toBe(scoreSignature({ ...base, player1_game_score: "30" }));
    expect(scoreSignature(base)).not.toBe(scoreSignature({ ...base, status: "suspended" }));
  });
});

describe("active window", () => {
  it("spans yesterday to tomorrow in UTC", () => {
    expect(activeWindow(new Date("2026-10-12T03:00:00Z"))).toEqual({ from: "2026-10-11", to: "2026-10-13" });
  });
});

describe("cross-source pairing", () => {
  it("builds the same key and games state whatever the player order", () => {
    const a = playersKey("Sara Sorribes Tormo", "Aliona Falei");
    const b = playersKey("Aliona Falei", "Sara Sorribes Tormo");
    expect(a.key).toBe(b.key);
    expect(a.flipped).not.toBe(b.flipped);

    const sets = [
      { p1: 4, p2: 6 },
      { p1: 1, p2: 3 },
    ];
    const flippedSets = sets.map((s) => ({ p1: s.p2, p2: s.p1 }));
    expect(orientedGamesState(sets, a.flipped)).toBe(orientedGamesState(flippedSets, b.flipped));
  });

  it("normalizes accents, Đ and particles", () => {
    expect(playersKey("Novak Đoković", "Alex de Minaur").key).toBe("djokovic|minaur");
    expect(playersKey("Novak Djokovic", "Alex de Minaur").key).toBe("djokovic|minaur");
  });

  it("skips empty sets in games state", () => {
    expect(gamesState([{ p1: 6, p2: 4 }, { p1: null, p2: null }])).toBe("6-4");
  });
});

describe("ESPN reference parsing", () => {
  it("keeps the tour's live singles only and orients like the provider", () => {
    const board = {
      events: [
        {
          groupings: [
            {
              grouping: { displayName: "Women's Singles" },
              competitions: [
                {
                  id: "184191",
                  status: { type: { state: "in" } },
                  competitors: [
                    { athlete: { displayName: "Sara Sorribes Tormo" }, linescores: [{ value: 4 }, { value: 1 }] },
                    { athlete: { displayName: "Aliona Falei" }, linescores: [{ value: 6 }, { value: 3 }] },
                  ],
                },
                { id: "2", status: { type: { state: "post" } }, competitors: [] },
              ],
            },
            { grouping: { displayName: "Women's Doubles" }, competitions: [{ id: "3", status: { type: { state: "in" } } }] },
            {
              grouping: { displayName: "Men's Singles" },
              competitions: [
                {
                  id: "4",
                  status: { type: { state: "in" } },
                  competitors: [
                    { athlete: { displayName: "Karen Khachanov" }, linescores: [{ value: 6 }] },
                    { athlete: { displayName: "Alex Molcan" }, linescores: [{ value: 5 }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(parseEspnLive(board, "wta")).toEqual([
      // "falei" sorts before "tormo", so Falei's games come first.
      { matchKey: "184191", playersKey: "falei|tormo", gamesState: "6-4 3-1", status: "in_progress" },
    ]);
    expect(parseEspnLive(board, "atp").map((m) => m.playersKey)).toEqual(["khachanov|molcan"]);
  });
});
