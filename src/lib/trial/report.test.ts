import { describe, expect, it } from "vitest";

import { coverage, gameLags, quantile, summarizePolls, updateIntervals, type Observation } from "./report";

const at = (s: number) => new Date(Date.UTC(2026, 9, 12, 4, 0, s)).toISOString();
const o = (source: string, key: string, games: string, s: number, point: string | null = null): Observation => ({
  source,
  tour: "atp",
  match_key: source === "espn" ? `e${key}` : key,
  players_key: `p${key}`,
  games_state: games,
  point_state: point,
  status: "in_progress",
  observed_at: at(s),
});

describe("trial report", () => {
  it("computes quantiles", () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([], 0.5)).toBeNull();
  });

  it("summarizes polls per source and tour", () => {
    const [s] = summarizePolls([
      { source: "balldontlie", tour: "atp", polled_at: at(0), http_status: 200, latency_ms: 300, live_count: 4 },
      { source: "balldontlie", tour: "atp", polled_at: at(20), http_status: 429, latency_ms: 100, live_count: null },
    ]);
    expect(s).toMatchObject({ key: "balldontlie/atp", polls: 2, ok: 1, rateLimited: 1, maxLive: 4 });
  });

  it("measures update intervals per provider match", () => {
    const obs = [o("balldontlie", "1", "1-0", 0, "15-0"), o("balldontlie", "1", "1-0", 40, "30-0"), o("balldontlie", "1", "2-0", 100)];
    expect(updateIntervals(obs)).toEqual([40, 60]);
  });

  it("measures provider lag behind the reference on shared games states", () => {
    const obs = [
      o("espn", "1", "1-0", 0),
      o("balldontlie", "1", "1-0", 30),
      o("balldontlie", "1", "1-0", 50, "15-0"), // later sighting of the same state is ignored
      o("espn", "1", "2-0", 200),
      o("balldontlie", "1", "2-0", 190), // provider earlier: negative lag
      o("balldontlie", "1", "3-0", 400), // reference never saw it: not paired
    ];
    expect(gameLags(obs).sort((a, b) => a - b)).toEqual([-10, 30]);
  });

  it("reports coverage across sources", () => {
    const obs = [o("espn", "1", "1-0", 0), o("balldontlie", "1", "1-0", 5), o("espn", "2", "0-1", 0)];
    expect(coverage(obs)).toEqual({ provider: 1, reference: 2, both: 1, referenceOnly: ["atp|p2"] });
  });
});
