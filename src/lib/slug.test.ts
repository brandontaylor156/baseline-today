import { describe, expect, it } from "vitest";

import { h2hPath, parseH2H, slugify } from "./slug";

describe("slugify", () => {
  it("strips accents and special letters", () => {
    expect(slugify("Novak Đoković")).toBe("novak-djokovic");
    expect(slugify("Holger Rune")).toBe("holger-rune");
    expect(slugify("Felix Auger-Aliassime")).toBe("felix-auger-aliassime");
    expect(slugify("Iga Świątek")).toBe("iga-swiatek");
    expect(slugify("Casper Ruud ")).toBe("casper-ruud");
    expect(slugify("Hubert Hurkacz Łódź")).toBe("hubert-hurkacz-lodz");
  });
});

describe("h2hPath / parseH2H", () => {
  it("puts the lower id first and round-trips", () => {
    const path = h2hPath({ id: 456, name: "Carlos Alcaraz" }, { id: 123, name: "Jannik Sinner" });
    expect(path).toBe("/h2h/jannik-sinner-vs-carlos-alcaraz-123-456");
    expect(parseH2H(path.slice(5))).toEqual({ a: 123, b: 456 });
  });

  it("rejects malformed and same-player slugs", () => {
    expect(parseH2H("sinner-vs-alcaraz")).toBeNull();
    expect(parseH2H("a-vs-a-5-5")).toBeNull();
    expect(parseH2H("x-1-2")).toEqual({ a: 1, b: 2 });
  });
});
