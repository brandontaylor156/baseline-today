import { describe, expect, it } from "vitest";

import { mostSimilar, standardize, standouts, type Profile } from "./similar";

const p = (id: number, over: Partial<Profile> = {}): Profile => ({
  player_id: id,
  name: `P${id}`,
  country: null,
  matches: 100,
  win_rate: 0.5,
  tiebreak_rate: 0.5,
  deciding_rate: 0.5,
  comeback_rate: 0.3,
  underdog_rate: 0.3,
  favourite_rate: 0.7,
  straight_share: 0.6,
  game_share: 0.5,
  hard_edge: 0,
  clay_edge: 0,
  grass_edge: 0,
  ...over,
});

describe("similarity", () => {
  const field = [
    p(1, { clay_edge: 120, grass_edge: -80, tiebreak_rate: 0.7 }),
    p(2, { clay_edge: 110, grass_edge: -70, tiebreak_rate: 0.68 }),
    p(3, { clay_edge: -100, grass_edge: 90, tiebreak_rate: 0.4 }),
    p(4),
    p(5, { game_share: 0.6 }),
  ];

  it("standardizes with a missing trait as average", () => {
    const z = standardize([...field, p(6, { clay_edge: null })]);
    expect(z.get(6)!.clay_edge).toBe(0);
  });

  it("finds the clay specialist's twin first and says what they share", () => {
    const [first] = mostSimilar(1, field);
    expect(first.profile.player_id).toBe(2);
    expect(first.similarity).toBeGreaterThan(70);
    expect(first.shared).toContain("clay edge");
    expect(mostSimilar(1, field).at(-1)!.profile.player_id).toBe(3);
    expect(mostSimilar(99, field)).toEqual([]);
  });

  it("lists standout traits", () => {
    expect(standouts(3, field).map((s) => s.label)).toContain("grass edge");
  });
});
