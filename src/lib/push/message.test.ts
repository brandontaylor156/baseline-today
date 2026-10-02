import { describe, expect, it } from "vitest";

import { resultMessage, winnerScore, type NotifyMatch } from "./message";

const set = (p1: number, p2: number, p1Tiebreak: number | null = null, p2Tiebreak: number | null = null) => ({ set: 0, p1, p2, p1Tiebreak, p2Tiebreak });

const match: NotifyMatch = {
  id: 7,
  round: "Final",
  resultDetail: null,
  sets: [set(4, 6), set(7, 6, null, 5), set(6, 3)],
  winner: 1,
  tournament: "CHINA OPEN",
  p1: { id: 10, name: "Jannik Sinner" },
  p2: { id: 20, name: "Carlos Alcaraz" },
};

describe("winnerScore", () => {
  it("orients sets to the winner and keeps tiebreak points", () => {
    expect(winnerScore(match.sets, 1)).toBe("4-6 7-6(5) 6-3");
    expect(winnerScore(match.sets, 2)).toBe("6-4 6-7(5) 3-6");
  });

  it("skips unplayed sets", () => {
    expect(winnerScore([set(6, 2), { set: 1, p1: null, p2: null, p1Tiebreak: null, p2Tiebreak: null }], 1)).toBe("6-2");
  });
});

describe("resultMessage", () => {
  it("tells a winner's fan they won", () => {
    expect(resultMessage(match, 10)).toEqual({
      title: "Jannik Sinner won",
      body: "Beat Carlos Alcaraz 4-6 7-6(5) 6-3 · China Open, Final",
      url: "/players/10",
      tag: "match-7",
    });
  });

  it("tells a loser's fan they lost, with the winner's score", () => {
    const m = resultMessage(match, 20);
    expect(m.title).toBe("Carlos Alcaraz lost");
    expect(m.body).toBe("Lost to Jannik Sinner 4-6 7-6(5) 6-3 · China Open, Final");
    expect(m.url).toBe("/players/20");
  });

  it("handles walkovers and retirements", () => {
    expect(resultMessage({ ...match, resultDetail: "walkover", sets: [] }, 10).body).toBe("Beat Carlos Alcaraz by walkover · China Open, Final");
    expect(resultMessage({ ...match, resultDetail: "retired", sets: [set(6, 1), set(2, 0)] }, 10).body).toBe(
      "Beat Carlos Alcaraz 6-1 2-0 ret. · China Open, Final",
    );
  });
});
