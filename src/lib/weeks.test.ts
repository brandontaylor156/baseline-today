import { describe, expect, it } from "vitest";

import { finishedWeeks, isMonday, mondayOf, shiftWeek, weekLabel, weekRange } from "./weeks";

describe("weeks", () => {
  it("finds the Monday of any day", () => {
    expect(mondayOf("2026-10-04")).toBe("2026-09-28"); // Sunday
    expect(mondayOf("2026-09-28")).toBe("2026-09-28");
    expect(mondayOf("2026-10-01")).toBe("2026-09-28");
  });

  it("validates week names", () => {
    expect(isMonday("2026-09-28")).toBe(true);
    expect(isMonday("2026-09-29")).toBe(false);
    expect(isMonday("2026-13-01")).toBe(false);
    expect(isMonday("nope")).toBe(false);
  });

  it("ranges, shifts and labels", () => {
    expect(weekRange("2026-09-28")).toEqual({ start: "2026-09-28", end: "2026-10-04" });
    expect(shiftWeek("2026-09-28", -1)).toBe("2026-09-21");
    expect(weekLabel("2026-09-28")).toBe("28 Sept – 4 Oct 2026");
  });

  it("lists complete weeks with a finished tournament, newest first", () => {
    const ends = ["2026-09-27", "2026-10-04", "2026-10-03", "2026-10-11", null];
    expect(finishedWeeks(ends, "2026-10-06")).toEqual(["2026-09-28", "2026-09-21"]);
  });
});
