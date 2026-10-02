import { describe, expect, it } from "vitest";

import { mapMatch, mapStatus, type BdlMatch, type BdlPlayer } from "./balldontlie-map";

const alcaraz: BdlPlayer = {
  id: 1,
  first_name: "Carlos",
  last_name: "Alcaraz",
  full_name: "Carlos Alcaraz",
  country: "Spain",
  country_code: "ESP",
  birth_place: "Spain",
  age: 22,
  height_cm: 183,
  weight_kg: 74,
  plays: "Right-Handed",
  turned_pro: 2018,
};
const sinner: BdlPlayer = { ...alcaraz, id: 2, first_name: "Jannik", last_name: "Sinner", full_name: "Jannik Sinner", country: "Italy", country_code: "ITA" };

/** The example from the BALLDONTLIE docs (US Open 2025 final). */
const docsExample: BdlMatch = {
  id: 50800,
  tournament: {
    id: 313,
    name: "US Open",
    location: "New York",
    surface: "Hard",
    category: "Grand Slam",
    season: 2025,
    start_date: "2025-08-24",
    end_date: "2025-09-07",
    prize_money: 40412800,
    prize_currency: "$",
    draw_size: 128,
  },
  season: 2025,
  round: "Finals",
  player1: alcaraz,
  player2: sinner,
  winner: alcaraz,
  score: "6-2 3-6 6-1 6-4",
  set_scores: [
    { set_number: 2, player1_games: 3, player2_games: 6, player1_tiebreak: null, player2_tiebreak: null },
    { set_number: 1, player1_games: 6, player2_games: 2, player1_tiebreak: null, player2_tiebreak: null },
    { set_number: 3, player1_games: 6, player2_games: 1, player1_tiebreak: null, player2_tiebreak: null },
    { set_number: 4, player1_games: 6, player2_games: 4, player1_tiebreak: null, player2_tiebreak: null },
  ],
  player1_game_score: null,
  player2_game_score: null,
  server: null,
  duration: "02:42:00",
  number_of_sets: 4,
  match_status: "finished",
  status_state: "final",
  is_live: false,
  scheduled_time: "2025-06-08T14:00:00.000Z",
  not_before_text: "Not Before 2:00 PM",
};

describe("mapMatch", () => {
  it("maps the documented example", () => {
    const m = mapMatch("atp", docsExample);
    expect(m).toMatchObject({
      tour: "atp",
      providerId: 50800,
      round: "Finals",
      winner: 1,
      status: "final",
      resultDetail: null,
      isLive: false,
      score: "6-2 3-6 6-1 6-4",
      scheduledAt: "2025-06-08T14:00:00.000Z",
      notBeforeText: "Not Before 2:00 PM",
    });
    expect(m.tournament).toMatchObject({ providerId: 313, name: "US Open", category: "Grand Slam", startDate: "2025-08-24" });
    expect(m.player1?.fullName).toBe("Carlos Alcaraz");
    expect(m.sets.map((s) => [s.set, s.p1, s.p2])).toEqual([
      [1, 6, 2],
      [2, 3, 6],
      [3, 6, 1],
      [4, 6, 4],
    ]);
  });

  it("maps a live match with point scores and an object server", () => {
    const m = mapMatch("wta", {
      ...docsExample,
      winner: null,
      score: "6-4 2-3",
      set_scores: [
        { set_number: 1, player1_games: 6, player2_games: 4, player1_tiebreak: null, player2_tiebreak: null },
        { set_number: 2, player1_games: 2, player2_games: 3, player1_tiebreak: null, player2_tiebreak: null },
      ],
      player1_game_score: 30,
      player2_game_score: "A",
      server: { id: 2, full_name: "Jannik Sinner" },
      match_status: "in_progress",
      status_state: "in_progress",
      is_live: true,
    });
    expect(m).toMatchObject({ winner: null, status: "in_progress", isLive: true, p1GameScore: "30", p2GameScore: "A", server: "Jannik Sinner" });
  });

  it("keeps walkover/retired detail and tolerates missing players", () => {
    const m = mapMatch("atp", { ...docsExample, match_status: "retired", player2: null, winner: alcaraz });
    expect(m.resultDetail).toBe("retired");
    expect(m.player2).toBeNull();
    expect(m.winner).toBe(1);
  });
});

describe("mapStatus", () => {
  it("prefers status_state and falls back to match_status", () => {
    expect(mapStatus("suspended", "in_progress")).toBe("suspended");
    expect(mapStatus(null, "walkover")).toBe("final");
    expect(mapStatus("weird", "in_progress")).toBe("in_progress");
    expect(mapStatus(null, null)).toBe("unknown");
  });
});

describe("mapOdds", () => {
  it("maps the documented odds row and drops impossible prices", async () => {
    const { mapOdds } = await import("./balldontlie-map");
    expect(
      mapOdds({ id: 78250352, match_id: 134142, vendor: "DraftKings", player1_odds: 3000, player2_odds: -100000, updated_at: "2026-01-12T23:40:23.936Z" }),
    ).toEqual({ matchProviderId: 134142, vendor: "draftkings", p1: 3000, p2: -100000, updatedAt: "2026-01-12T23:40:23.936Z" });
    expect(mapOdds({ id: 1, match_id: 2, vendor: "x", player1_odds: 50, player2_odds: null, updated_at: null })).toMatchObject({ p1: null, p2: null });
    expect(mapOdds({ id: 1, match_id: 2, vendor: null, player1_odds: 100, player2_odds: 100, updated_at: null })).toBeNull();
  });
});
