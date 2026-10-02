import { describe, expect, it } from "vitest";

import { drawSizeFits, editionMatches, eventName, levelFits, searchPhrases, titleScore, tourMentioned } from "./identity";

describe("eventName", () => {
  it("extracts the event from a draw title", () => {
    expect(eventName("2026 China Open – Women's singles")).toBe("China Open");
    expect(eventName("2026 Japan Open Tennis Championships – Singles")).toBe("Japan Open Tennis Championships");
  });
});

describe("titleScore: the mistakes of the first backfill must all score 0", () => {
  const wrong: [string, string, string | null][] = [
    ["2026 US Open – Women's singles", "BEIJING", "BEIJING, CHN"],
    ["2026 Dubai Tennis Championships – Women's singles", "DOHA", "DOHA, QAT"],
    ["2026 Dubai Tennis Championships – Men's singles", "Brisbane International presented by ANZ", "Brisbane"],
    ["2026 Trophée Clarins – Singles", "JINGSHAN 125", "JINGSHAN, CHN"],
    ["2026 Wimbledon Championships – Men's singles", "ABN AMRO Open", "Rotterdam"],
    ["2026 Australian Open – Men's singles", "Open Occitanie", "Montpellier"],
    ["2026 Italian Open – Men's singles", "Rolex Monte-Carlo Masters", "Monte Carlo"],
    ["2026 Dubai Tennis Championships – Men's singles", "United Cup", "Perth"],
  ];
  it.each(wrong)("%s is not %s", (title, name, location) => {
    expect(titleScore(title, name, location)).toBe(0);
  });
});

describe("titleScore: right pages score above 0", () => {
  const right: [string, string, string | null][] = [
    ["2026 China Open – Women's singles", "BEIJING", "BEIJING, CHN"],
    ["2026 China Open – Men's singles", "China Open", "Beijing"],
    ["2026 Jingshan Tennis Open – Women's singles", "JINGSHAN 125", "JINGSHAN, CHN"],
    ["2026 Brisbane International – Men's singles", "Brisbane International presented by ANZ", "Brisbane"],
    ["2026 Qatar Open – Women's singles", "DOHA", "DOHA, QAT"],
    ["2026 Monte-Carlo Masters – Singles", "Rolex Monte-Carlo Masters", "Monte Carlo"],
    ["2026 Rotterdam Open – Singles", "ABN AMRO Open", "Rotterdam"],
    ["2026 Mérida Open – Singles", "MÉRIDA", "MERIDA, MEX"],
    ["2026 Halle Open – Singles", "Terra Wortmann Open", "Halle"],
    ["2026 US Open – Women's singles", "US OPEN", "NEW YORK, USA"],
  ];
  it.each(right)("%s is %s", (title, name, location) => {
    expect(titleScore(title, name, location)).toBeGreaterThan(0);
  });

  it("never gives an ATP event a Challenger page (Argentina Open vs Challenger de Buenos Aires)", () => {
    expect(titleScore("2026 Challenger de Buenos Aires – Singles", "IEB+ Argentina Open", "Buenos Aires", "atp")).toBe(0);
    expect(titleScore("2026 Argentina Open – Singles", "IEB+ Argentina Open", "Buenos Aires", "atp")).toBeGreaterThan(0);
    expect(titleScore("2026 Antalya Challenger 2 – Singles", "ANTALYA 125 #2", "ANTALYA, TUR", "wta")).toBeGreaterThan(0);
  });

  it("prefers an exact alias over a partial word match", () => {
    expect(titleScore("2026 China Open – Women's singles", "BEIJING", "BEIJING, CHN")).toBeGreaterThan(
      titleScore("2026 Beijing Challenger – Singles", "BEIJING", "BEIJING, CHN"),
    );
  });
});

describe("tour and draw checks", () => {
  it("tells WTA pages from ATP pages by their mentions", () => {
    expect(tourMentioned("a WTA 125 event, WTA ranking", "wta")).toBe(true);
    expect(tourMentioned("an ATP Challenger Tour event", "wta")).toBe(false);
    expect(tourMentioned("ATP 250, ATP rankings, one WTA mention", "atp")).toBe(true);
  });

  it("rejects pages whose draw size doesn't fit (the Madrid swap)", () => {
    expect(drawSizeFits(96, 32)).toBe(false); // Mutua Madrid Open page for MADRID 125
    expect(drawSizeFits(32, 96)).toBe(false); // Open Villa de Madrid page for the WTA 1000
    expect(drawSizeFits(96, 96)).toBe(true);
    expect(drawSizeFits(32, 28)).toBe(true);
    expect(drawSizeFits(0, 32)).toBe(false); // draw not made yet
  });
});

describe("levelFits (Lyon ATP 250 vs the Open Sopra Steria de Lyon Challenger)", () => {
  it("uses Wikipedia categories to match the event level", () => {
    expect(levelFits(["2025 ATP Challenger Tour", "Open Sopra Steria de Lyon"], "atp", "ATP 250")).toBe(false);
    expect(levelFits(["2026 ATP Tour", "Japan Open (tennis)"], "atp", "ATP 500")).toBe(true);
    expect(levelFits(["2025 WTA 125 tournaments"], "wta", "WTA 125")).toBe(true);
    expect(levelFits(["2025 WTA Tour"], "wta", "WTA 125")).toBe(false);
    expect(levelFits(["2025 WTA 125 tournaments"], "wta", "WTA 1000")).toBe(false);
    expect(levelFits([], "wta", "WTA 250")).toBe(true);
  });
});

describe("gap-fill aliases", () => {
  it("finds sponsor-named WTA 125 pages", () => {
    expect(titleScore("2026 Dow Tennis Classic – Singles", "MIDLAND 125", "MIDLAND, USA", "wta")).toBeGreaterThan(0);
    expect(titleScore("2026 Trophée Clarins – Singles", "PARIS 125", "PARIS, FRA", "wta")).toBeGreaterThan(0);
    expect(titleScore("2026 SP Open – Singles", "SAO PAULO", "SAO PAULO, BRA", "wta")).toBeGreaterThan(0);
  });

  it("keeps ROME 125 apart from the WTA 1000 in Rome", () => {
    expect(titleScore("2026 Italian Open – Women's singles", "ROME 125", "ROME, ITA", "wta")).toBe(0);
    expect(titleScore("2026 Italian Open – Women's singles", "ROME", "ROME, ITA", "wta")).toBeGreaterThan(0);
  });

  it("doesn't read a roman numeral in the real name as an edition", () => {
    expect(editionMatches("Grand Prix Hassan II", "2026 Grand Prix Hassan II – Singles")).toBe(true);
    expect(editionMatches("SAINT MALO 125", "2026 L'Open 35 de Saint-Malo – Singles")).toBe(true);
    expect(editionMatches("CONTREXEVILLE 125", "2026 Grand Est Open 88 – Singles")).toBe(true);
  });

  it("keeps indoor/outdoor and unnumbered siblings apart (the Oeiras and Antalya mistakes)", () => {
    expect(editionMatches("OEIRAS 125 OUTDOOR #2", "Oeiras Indoor 2 2026 - Singolare")).toBe(false);
    expect(editionMatches("OEIRAS 125 INDOOR #2", "Oeiras Indoor 2 2026 - Singolare")).toBe(true);
    expect(editionMatches("ANTALYA 125 (ATIK)", "Antalya Open 1 2026 - Singolare", true)).toBe(false);
    expect(editionMatches("BEIJING", "2026 China Open – Women's singles", false)).toBe(true);
    expect(editionMatches("ANTALYA 125 #2", "2026 Antalya Challenger 1 – Singles")).toBe(false);
  });
});

describe("editions", () => {
  it("matches numbered editions", () => {
    expect(editionMatches("ANTALYA 125 #2", "2026 Antalya Challenger 2 – Singles")).toBe(true);
    expect(editionMatches("ANTALYA 125 #2", "2026 Antalya Challenger 1 – Singles")).toBe(false);
    expect(editionMatches("OEIRAS 125 INDOOR #2", "2026 Oeiras Ladies Open II – Singles")).toBe(true);
    expect(editionMatches("OEIRAS 125", "2026 Oeiras Ladies Open II – Singles")).toBe(false);
    expect(editionMatches("BEIJING", "2026 China Open – Women's singles")).toBe(true);
  });
});

describe("searchPhrases", () => {
  it("searches aliases first and drops sponsor tails", () => {
    expect(searchPhrases("BEIJING", "BEIJING, CHN")).toEqual(["China Open", "Beijing"]);
    expect(searchPhrases("Brisbane International presented by ANZ", "Brisbane")).toEqual(["Brisbane International", "Brisbane"]);
  });
});
