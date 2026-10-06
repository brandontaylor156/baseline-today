import { describe, expect, it } from "vitest";

import { countsForRace, expectedPoints, pointsFor, resultsWorth } from "./points";

describe("pointsFor", () => {
  it("pays by exit round from the title backwards", () => {
    // Grand Slam: 7 rounds.
    expect(pointsFor("atp", "Grand Slam", 7, 7)).toBe(2000);
    expect(pointsFor("atp", "Grand Slam", 7, 6)).toBe(1300);
    expect(pointsFor("atp", "Grand Slam", 7, 0)).toBe(10);
    expect(pointsFor("wta", "Grand Slam", 7, 4)).toBe(430);
    // 32-draw WTA 250: 5 rounds; first-round loss.
    expect(pointsFor("wta", "WTA 250", 5, 0)).toBe(1);
    expect(pointsFor("wta", "WTA 250", 5, 2)).toBe(54);
  });

  it("gives first-round points for a loss after a bye", () => {
    // 96-draw Masters in a 128 layout: 7 rounds; bye then lose in round 2.
    expect(pointsFor("atp", "Masters 1000", 7, 1, true)).toBe(10);
    expect(pointsFor("atp", "Masters 1000", 7, 2, true)).toBe(50);
  });

  it("ignores team events and the Finals", () => {
    expect(countsForRace("atp", "United Cup")).toBe(false);
    expect(countsForRace("wta", "WTA Finals")).toBe(false);
    expect(pointsFor("atp", null, 5, 5)).toBe(0);
  });
});

describe("expectedPoints", () => {
  it("weights each exit by its chance", () => {
    // ATP 250, 2 rounds left in a 2-round view: certain QF... use a 5-round draw where the
    // player already won 3 (semifinalist) and is 50/50 in each remaining match.
    const reach = [1, 1, 1, 1, 0.5, 0.25];
    expect(expectedPoints("atp", "ATP 250", 5, reach)).toBeCloseTo(0.5 * 100 + 0.25 * 165 + 0.25 * 250);
  });
});

describe("resultsWorth", () => {
  it("finds the smallest result per category that covers the gap", () => {
    expect(resultsWorth("atp", 310, ["Masters 1000", "ATP 500", "ATP 250", "ATP 500"])).toEqual([
      { category: "ATP 500", result: "final", points: 330 },
      { category: "Masters 1000", result: "semifinal", points: 400 },
    ]);
  });
  it("needs a title when the gap is big, nothing when it can't be closed in one event", () => {
    expect(resultsWorth("wta", 600, ["WTA 500", "WTA 1000"])).toEqual([{ category: "WTA 1000", result: "final", points: 650 }]);
    expect(resultsWorth("atp", 1200, ["ATP 250"])).toEqual([]);
  });
});
