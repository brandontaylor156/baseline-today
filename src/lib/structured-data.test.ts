import { describe, expect, it } from "vitest";

import { ldScript, matchLd, playerLd, tournamentLd, websiteLd } from "./structured-data";

describe("structured data", () => {
  it("website search action points at /search", () => {
    expect(JSON.stringify(websiteLd())).toContain("/search?q={search_term_string}");
  });

  it("player: only facts we have", () => {
    const ld = playerLd({ id: 7, tour: "wta", fullName: "Coco Gauff", countryName: "United States", birthDate: null, birthPlace: null, heightCm: 175, imageUrl: null });
    expect(ld).toMatchObject({ "@type": "Person", name: "Coco Gauff", memberOf: { name: "WTA Tour" }, height: { value: 175 } });
    expect(ld).not.toHaveProperty("birthDate");
    expect(ld).not.toHaveProperty("image");
  });

  it("match: competitors and winner", () => {
    const ld = matchLd({ id: 1, name: "A vs B", tournament: "Beijing", location: null, startDate: "2026-10-01", a: { id: 3, name: "A" }, b: { id: null, name: "B" }, winner: 2 });
    expect(ld.competitor).toHaveLength(2);
    expect(ld.winner).toEqual({ "@type": "Person", name: "B" });
  });

  it("tournament without dates leaves them out", () => {
    const ld = tournamentLd({ id: 1, name: "Cup", location: null, startDate: null, endDate: null, champion: null });
    expect(ld).not.toHaveProperty("startDate");
  });

  it("escapes < so the script tag can't be closed early", () => {
    expect(ldScript({ name: "</script><b>" })).not.toContain("<");
  });
});
