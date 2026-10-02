import { describe, expect, it } from "vitest";

import { RECAP_SYSTEM, recapPrompt } from "./recap-prompt";

describe("recapPrompt", () => {
  const base = {
    tournament: "China Open",
    category: "ATP 500",
    surface: "Hard",
    round: "Final",
    winner: "Alexander Zverev",
    loser: "Daniil Medvedev",
    score: "6-4 7-6(5)",
    retired: false,
    winnerChance: 0.31,
    h2h: { winner: 6, loser: 10 },
  };

  it("states only the given facts, flagging upsets", () => {
    const p = recapPrompt(base);
    expect(p).toContain("Score (winner first): 6-4 7-6(5)");
    expect(p).toContain("31% chance before the match (an upset)");
    expect(p).toContain("Alexander Zverev 6, Daniil Medvedev 10");
  });

  it("leaves out what isn't known", () => {
    const p = recapPrompt({ ...base, winnerChance: null, h2h: null, retired: true });
    expect(p).not.toContain("chance");
    expect(p).not.toContain("Head-to-head");
    expect(p).toContain("(loser retired)");
  });

  it("forbids invention and betting talk", () => {
    expect(RECAP_SYSTEM).toMatch(/only the facts/i);
    expect(RECAP_SYSTEM).toMatch(/no betting/i);
  });
});
