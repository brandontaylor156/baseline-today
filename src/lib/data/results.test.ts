import { describe, expect, it } from "vitest";

import { dedupeResults, sortGroups, sortResults, titleFromUrl, toResult, type ResultRow, type ResultsGroup } from "./results";

function row(id: number, over: Partial<ResultRow> = {}): ResultRow {
  return {
    id,
    provider: "wikipedia",
    tour: "wta",
    round: "Second round",
    status: "final",
    result_detail: null,
    set_scores: [{ set: 1, p1: 6, p2: 3, p1Tiebreak: null, p2Tiebreak: null }],
    winner_side: 1,
    winner_id: null,
    player1_name: "Liudmila Samsonova",
    player2_name: "Linda Fruhvirtová",
    player1_country: null,
    player2_country: "CZE",
    source_url: "https://en.wikipedia.org/wiki/2026_China_Open_%E2%80%93_Women%27s_singles",
    score_changed_at: "2026-10-02T05:50:00Z",
    season: 2026,
    tournaments: { id: 79, name: "BEIJING", category: "WTA 1000", start_date: "2026-09-30", end_date: "2026-10-11" },
    p1: { id: 7, full_name: "Liudmila Samsonova", country_code: null },
    p2: null,
    ...over,
  };
}

describe("results helpers", () => {
  it("shows players without a profile by name and keeps their country", () => {
    const r = toResult(row(1));
    expect(r.player1).toEqual({ id: 7, name: "Liudmila Samsonova", countryCode: null });
    expect(r.player2).toEqual({ id: null, name: "Linda Fruhvirtová", countryCode: "CZE" });
    expect(r.winner).toBe(1);
  });

  it("prefers the provider's copy when both sources have the match", () => {
    const wiki = toResult(row(1));
    const provider = toResult(row(2, { provider: "balldontlie", player1_name: null, p2: { id: 9, full_name: "Linda Fruhvirtova", country_code: "CZE" } }));
    expect(dedupeResults([wiki, provider]).map((r) => r.id)).toEqual([2]);
  });

  it("orders later rounds first, then most recently reported", () => {
    const sorted = sortResults([
      toResult(row(1, { round: "First round" })),
      toResult(row(2, { round: "Second round", score_changed_at: "2026-10-02T04:00:00Z" })),
      toResult(row(3, { round: "Second round", score_changed_at: "2026-10-02T06:00:00Z" })),
    ]);
    expect(sorted.map((r) => r.id)).toEqual([3, 2, 1]);
  });

  it("lists tournaments in play first, then the most recently finished", () => {
    const g = (id: number, endDate: string): ResultsGroup => ({ id, name: String(id), category: null, tour: "atp", endDate, sources: [], results: [] });
    expect(sortGroups([g(1, "2026-09-29"), g(2, "2026-10-06"), g(3, "2026-09-30")], "2026-10-02").map((x) => x.id)).toEqual([2, 3, 1]);
  });

  it("turns a source URL back into a readable title", () => {
    expect(titleFromUrl(row(1).source_url!)).toBe("2026 China Open – Women's singles");
  });
});
