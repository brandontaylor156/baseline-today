import { describe, expect, it } from "vitest";

import { BOT_DESCRIPTION, BOT_DISPLAY_NAME, BOT_INTRO } from "./bluesky";

const graphemes = (s: string) => [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment(s)].length;

describe("bot profile", () => {
  it("says it's automated, within Bluesky's limits (64 / 256 graphemes)", () => {
    expect(BOT_DISPLAY_NAME).toMatch(/\bbot\b/i);
    expect(BOT_DESCRIPTION).toMatch(/^🤖 Automated account\./);
    expect(graphemes(BOT_DISPLAY_NAME)).toBeLessThanOrEqual(64);
    expect(graphemes(BOT_DESCRIPTION)).toBeLessThanOrEqual(256);
  });

  it("intro post says it's automated and fits in one post", () => {
    expect(BOT_INTRO).toContain("automated account");
    expect(graphemes(BOT_INTRO)).toBeLessThanOrEqual(300);
  });
});
