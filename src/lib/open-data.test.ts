import { describe, expect, it } from "vitest";

import { parseDataFile, toCsv } from "./open-data";

describe("parseDataFile", () => {
  it("accepts seasons in range and the two formats", () => {
    expect(parseDataFile("results-2026.csv", 2026)).toEqual({ kind: "results", season: 2026, format: "csv" });
    expect(parseDataFile("results-2015.json", 2026)).toEqual({ kind: "results", season: 2015, format: "json" });
    expect(parseDataFile("ratings.csv", 2026)).toEqual({ kind: "ratings", format: "csv" });
  });

  it("rejects anything else", () => {
    expect(parseDataFile("results-2014.csv", 2026)).toBeNull();
    expect(parseDataFile("results-2027.csv", 2026)).toBeNull();
    expect(parseDataFile("rankings.csv", 2026)).toBeNull();
    expect(parseDataFile("../secret", 2026)).toBeNull();
  });
});

describe("toCsv", () => {
  it("quotes, escapes and defuses formulas", () => {
    expect(toCsv(["a", "b"], [["x,y", 'say "hi"'], [null, 3], ["=SUM(A1)", "-5"]])).toBe('a,b\r\n"x,y","say ""hi"""\r\n,3\r\n\'=SUM(A1),\'-5\r\n');
  });
});
