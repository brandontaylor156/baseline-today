import { describe, expect, it } from "vitest";

import type { WikiMatch } from "./draw-parse";
import {
  findPlayer,
  knownPlayers,
  playerIndex,
  resultSignature,
  roundRank,
  scoreText,
  titleFitsTour,
  wikiMatchRow,
  wikiProviderId,
} from "./rows";

const match: WikiMatch = {
  round: "Second round",
  p1: { name: "Linda Fruhvirtová", country: "CZE", seed: "LL" },
  p2: { name: "Liudmila Samsonova", country: null, seed: "29" },
  winner: 2,
  sets: [
    { p1: 2, p2: 6, p1Tiebreak: null, p2Tiebreak: null },
    { p1: 7, p2: 6, p1Tiebreak: 7, p2Tiebreak: 4 },
    { p1: 3, p2: 6, p1Tiebreak: null, p2Tiebreak: null },
  ],
  detail: null,
};

describe("player matching", () => {
  const index = playerIndex([
    { id: 1, full_name: "Liudmila Samsonova" },
    { id: 2, full_name: "Shuai Zhang" },
  ]);

  it("matches across accents and East Asian name order", () => {
    expect(findPlayer(index, "Liudmila Samsonova")).toBe(1);
    expect(findPlayer(index, "Zhang Shuai")).toBe(2);
    expect(findPlayer(index, "Linda Fruhvirtová")).toBeNull();
  });

  it("counts known players on a page", () => {
    expect(knownPlayers([match], index)).toBe(1);
  });
});

describe("rows", () => {
  const index = playerIndex([{ id: 7, full_name: "Liudmila Samsonova" }]);
  const ctx = { tour: "wta" as const, tournamentId: 79, season: 2026, sourceUrl: "https://en.wikipedia.org/wiki/X", index };

  it("stores names for unknown players and the winner side", () => {
    const row = wikiMatchRow(match, ctx, false, new Date("2026-10-02T06:00:00Z"));
    expect(row).toMatchObject({
      provider: "wikipedia",
      player1_id: null,
      player1_name: "Linda Fruhvirtová",
      player2_id: 7,
      winner_side: 2,
      winner_id: 7,
      status: "final",
      score: "2-6 7-6(4) 3-6",
      confirmed: false,
      source_key: "secondround|fruhvirtova|samsonova",
    });
  });

  it("gives the same id whatever the player order", () => {
    const swapped = { ...match, p1: match.p2, p2: match.p1 };
    expect(wikiMatchRow(swapped, ctx, true, new Date()).provider_id).toBe(wikiMatchRow(match, ctx, true, new Date()).provider_id);
    expect(wikiProviderId(79, "a")).not.toBe(wikiProviderId(80, "a"));
    expect(Number.isSafeInteger(wikiProviderId(79, "a"))).toBe(true);
  });

  it("formats retirements and walkovers", () => {
    expect(scoreText({ ...match, detail: "retired", sets: [{ p1: 1, p2: 4, p1Tiebreak: null, p2Tiebreak: null }] })).toBe("1-4 ret.");
    expect(scoreText({ ...match, detail: "walkover", sets: [] })).toBe("w/o");
  });

  it("changes signature when what visitors see changes", () => {
    expect(resultSignature({ winner_side: 1, score: "6-4 6-4", result_detail: null })).not.toBe(
      resultSignature({ winner_side: 2, score: "6-4 6-4", result_detail: null }),
    );
  });
});

describe("discovery", () => {
  it("keeps the right draw at combined events", () => {
    expect(titleFitsTour("2026 China Open – Women's singles", "wta")).toBe(true);
    expect(titleFitsTour("2026 China Open – Men's singles", "wta")).toBe(false);
    expect(titleFitsTour("2026 China Open – Women's singles", "atp")).toBe(false);
    expect(titleFitsTour("2026 Japan Open Tennis Championships – Singles", "atp")).toBe(true);
  });

  it("ranks rounds from both sources", () => {
    expect(roundRank("Final")).toBeGreaterThan(roundRank("Semifinals"));
    expect(roundRank("Semi-Finals")).toBe(roundRank("Semifinals"));
    expect(roundRank("Quarterfinals")).toBeGreaterThan(roundRank("Fourth round"));
    expect(roundRank("First round")).toBeGreaterThan(roundRank(null));
  });
});
