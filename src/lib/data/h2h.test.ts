import { describe, expect, it } from "vitest";

import { tally } from "./h2h";
import type { Result } from "./results";

const meeting = (id: number, p1: number, p2: number, winner: 1 | 2, surface: string | null, detail: string | null = null) =>
  ({
    id,
    player1: { id: p1, name: String(p1), countryCode: null },
    player2: { id: p2, name: String(p2), countryCode: null },
    winner,
    resultDetail: detail,
    surface,
  }) as unknown as Result & { surface: string | null };

describe("head-to-head tally", () => {
  it("counts wins from either side and by surface, ignoring walkovers", () => {
    const t = tally(
      [
        meeting(1, 4, 9, 1, "Hard"), // A (4) wins as player 1
        meeting(2, 9, 4, 2, "Hard"), // A wins as player 2
        meeting(3, 9, 4, 1, "Clay"), // B wins
        meeting(4, 4, 9, 2, "Grass", "walkover"), // not counted
      ],
      4,
    );
    expect([t.winsA, t.winsB]).toEqual([2, 1]);
    expect(t.bySurface).toEqual([
      { surface: "Hard", a: 2, b: 0 },
      { surface: "Clay", a: 0, b: 1 },
    ]);
  });
});
