import { describe, expect, it } from "vitest";

import { eventDates } from "./event-dates";

describe("eventDates", () => {
  it("reads the common infobox formats", () => {
    expect(eventDates("13–19 March", 2023)).toEqual({ start: "2023-03-13", end: "2023-03-19" });
    expect(eventDates("27 February – 5 March", 2023)).toEqual({ start: "2023-02-27", end: "2023-03-05" });
    expect(eventDates("March 13–19", 2023)).toEqual({ start: "2023-03-13", end: "2023-03-19" });
    expect(eventDates("January 30 – February 5, 2023", 2023)).toEqual({ start: "2023-01-30", end: "2023-02-05" });
    expect(eventDates("{{nowrap|25 December – 31 December}}", 2023)).toEqual({ start: "2023-12-25", end: "2023-12-31" });
    expect(eventDates("31 December – 6 January", 2024)).toEqual({ start: "2023-12-31", end: "2024-01-06" });
  });
  it("gives up on text without dates", () => {
    expect(eventDates("TBA", 2023)).toBeNull();
  });
});
