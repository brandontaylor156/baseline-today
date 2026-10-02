import { describe, expect, it } from "vitest";

import { buildCalendar, escapeText, fold } from "./ics";

describe("escapeText", () => {
  it("escapes the characters iCalendar reserves", () => {
    expect(escapeText("a,b;c\\d\ne")).toBe(["a\\,b\\;c\\\\d", "e"].join("\\n"));
  });
});

describe("fold", () => {
  it("keeps every line within 75 octets, counting multi-byte characters", () => {
    const folded = fold(`SUMMARY:${"Đoković ".repeat(20)}`);
    for (const line of folded.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(folded.split("\r\n").slice(1).every((l) => l.startsWith(" "))).toBe(true);
    expect(folded.replace(/\r\n /g, "")).toBe(`SUMMARY:${"Đoković ".repeat(20)}`);
  });
});

describe("buildCalendar", () => {
  const ics = buildCalendar(
    "Jannik Sinner",
    [
      { uid: "t1@baseline", summary: "China Open, Beijing", start: "2026-09-30", end: "2026-10-06", allDay: true, url: "https://x.test/t/1" },
      { uid: "m1@baseline", summary: "Sinner vs Alcaraz", start: "2026-10-05T12:30:00Z", allDay: false },
    ],
    new Date("2026-10-02T00:00:00Z"),
  );

  it("writes CRLF lines with a header and footer", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.includes("\n") && !/[^\r]\n/.test(ics)).toBe(true);
  });

  it("makes all-day end dates exclusive and times UTC", () => {
    expect(ics).toContain("DTSTART;VALUE=DATE:20260930\r\nDTEND;VALUE=DATE:20261007");
    expect(ics).toContain("DTSTART:20261005T123000Z\r\nDTEND:20261005T143000Z");
    expect(ics).toContain("SUMMARY:China Open\\, Beijing");
  });
});
