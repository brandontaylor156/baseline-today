import { describe, expect, it } from "vitest";

import { mondays } from "./rankings-history";

describe("mondays", () => {
  it("lists ranking weeks in a range", () => {
    expect(mondays("2026-09-01", "2026-09-28")).toEqual(["2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);
    expect(mondays("2026-09-07", "2026-09-07")).toEqual(["2026-09-07"]);
    expect(mondays("2026-09-08", "2026-09-13")).toEqual([]);
  });
});
