import { describe, expect, it } from "vitest";

import { bestRank, describeMovement, formatDate, formatHeight, initials, isTour } from "./format";

describe("format", () => {
  it("builds initials from first and last words", () => {
    expect(initials("Jannik Sinner")).toBe("JS");
    expect(initials("Felix Auger-Aliassime")).toBe("FA");
    expect(initials("Alcaraz")).toBe("A");
    expect(initials("  ")).toBe("?");
  });

  it("formats dates without time-zone drift", () => {
    expect(formatDate("2026-09-28")).toBe("28 Sep 2026");
  });

  it("formats height in metric and imperial", () => {
    expect(formatHeight(191)).toBe("191 cm (6′3″)");
    expect(formatHeight(null)).toBeNull();
  });

  it("describes ranking movement", () => {
    expect(describeMovement(3)).toEqual({ label: "Up 3 places", short: "▲3", direction: "up" });
    expect(describeMovement(-1)).toEqual({ label: "Down 1 place", short: "▼1", direction: "down" });
    expect(describeMovement(0).direction).toBe("none");
    expect(describeMovement(null).direction).toBe("none");
  });

  it("finds the best tracked rank and when it was first reached", () => {
    const history = [
      { date: "2026-09-14", rank: 5 },
      { date: "2026-09-21", rank: 3 },
      { date: "2026-09-28", rank: 3 },
    ];
    expect(bestRank(history)).toEqual({ rank: 3, date: "2026-09-21" });
    expect(bestRank([])).toBeNull();
  });

  it("recognizes tours", () => {
    expect(isTour("atp")).toBe(true);
    expect(isTour("itf")).toBe(false);
  });
});
