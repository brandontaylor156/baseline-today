import { describe, expect, it } from "vitest";

import { runLab, type LabMatch } from "./engine";

const m = (id: number, t: number, start: string, round: number, key1: string, key2: string, winner: 1 | 2, over: Partial<LabMatch> = {}): LabMatch => ({
  id,
  tour: "atp",
  tournamentId: t,
  startDate: start,
  round,
  key1,
  key2,
  winner,
  surface: "hard",
  bestOf: 3,
  walkover: false,
  ...over,
});

describe("runLab", () => {
  it("gives even chances in a first draw, then favours the earlier champion", () => {
    const first = [m(1, 10, "2020-01-06", 1, "A", "B", 1), m(2, 10, "2020-01-06", 1, "C", "D", 1), m(3, 10, "2020-01-06", 2, "A", "C", 1)];
    const second = [m(4, 11, "2020-01-13", 1, "A", "B", 1), m(5, 11, "2020-01-13", 1, "C", "D", 2), m(6, 11, "2020-01-13", 2, "A", "D", 2)];
    const out = runLab([...second, ...first], { atp: 1 });
    expect(out.drawsBuilt).toBe(2);
    const t10 = out.titles.filter((r) => r.tournamentId === 10);
    for (const r of t10) expect(r.chance).toBeCloseTo(0.25);
    expect(t10.find((r) => r.champion)!.key).toBe("A");
    const t11 = new Map(out.titles.filter((r) => r.tournamentId === 11).map((r) => [r.key, r]));
    // A won the first event, so A is the favourite going into the second; D (champion) was not.
    expect(t11.get("A")!.chance).toBeGreaterThan(t11.get("D")!.chance);
    expect(t11.get("D")!.champion).toBe(true);
    expect([...t11.values()].reduce((s, r) => s + r.chance, 0)).toBeCloseTo(1);
  });

  it("keeps weekly rating snapshots and skips draws that can't be rebuilt", () => {
    // B lost in round 1 and plays again in round 2: the results don't form a draw.
    const broken = [m(1, 20, "2021-03-01", 1, "A", "B", 1), m(2, 20, "2021-03-01", 2, "B", "C", 1)];
    const out = runLab(broken, {});
    expect(out.drawsBuilt).toBe(0);
    expect(out.ratings.find((r) => r.key === "B" && r.week === "2021-03-01")!.matches).toBe(2);
  });

  it("walkovers shape the draw but don't change ratings", () => {
    const out = runLab([m(1, 30, "2022-05-02", 1, "A", "B", 1, { walkover: true }), m(2, 30, "2022-05-02", 1, "C", "D", 1), m(3, 30, "2022-05-02", 2, "A", "C", 1)], { atp: 1 });
    expect(out.drawsBuilt).toBe(1);
    expect(out.ratings.find((r) => r.key === "A")!.matches).toBe(1);
  });
});

describe("titles denied", () => {
  it("credits a dominant player's rivals with the titles they'd have had without them", () => {
    // A wins three events in a row; then a fourth draw where A is the big favourite over B.
    const ms: LabMatch[] = [];
    let id = 1;
    for (let t = 0; t < 4; t++) {
      const d = `2020-0${t + 1}-06`;
      ms.push(m(id++, 50 + t, d, 1, "A", "C", 1), m(id++, 50 + t, d, 1, "B", "D", 1), m(id++, 50 + t, d, 2, "A", "B", 1));
    }
    const out = runLab(ms, { atp: 1 });
    const bByA = out.denied.find((d) => d.player === "A" && d.other === "B");
    expect(bByA).toBeDefined();
    expect(bByA!.gain).toBeGreaterThan(0.1);
    expect(out.denied.every((d) => d.gain >= 0.02)).toBe(true);
  });
});
