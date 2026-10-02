import { describe, expect, it } from "vitest";

import { calendarSections, dateRange, displayName, type TournamentSummary } from "./tournaments";

const t = (id: number, startDate: string, endDate: string): TournamentSummary => ({
  id,
  tour: "wta",
  name: String(id),
  category: "WTA 1000",
  location: null,
  surface: null,
  startDate,
  endDate,
  drawSize: null,
  champion: null,
});

describe("tournament helpers", () => {
  it("splits the calendar into now, upcoming and recently finished", () => {
    const list = [t(1, "2026-09-01", "2026-09-07"), t(2, "2026-09-21", "2026-09-27"), t(3, "2026-09-30", "2026-10-11"), t(4, "2026-10-12", "2026-10-18"), t(5, "2026-12-01", "2026-12-07")];
    const s = calendarSections(list, "2026-10-02");
    expect(s.now.map((x) => x.id)).toEqual([3]);
    expect(s.upcoming.map((x) => x.id)).toEqual([4]);
    expect(s.finished.map((x) => x.id)).toEqual([2, 1]);
  });

  it("formats date ranges", () => {
    expect(dateRange("2026-09-30", "2026-10-11")).toBe("30 Sept – 11 Oct".replace("Sept", new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(new Date("2026-09-30T00:00:00Z"))));
    expect(dateRange(null, null)).toBe("");
  });

  it("proper-cases shouting provider names only", () => {
    expect(displayName("BEIJING")).toBe("Beijing");
    expect(displayName("JINGSHAN 125")).toBe("Jingshan 125");
    expect(displayName("'S-HERTOGENBOSCH")).toBe("'S-Hertogenbosch");
    expect(displayName("China Open")).toBe("China Open");
  });
});
