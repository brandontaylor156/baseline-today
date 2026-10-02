// Runs against the local Supabase started in CI (npm run test:integration), never production.
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { ProviderError } from "@/lib/provider/balldontlie";
import type { ProviderMatch, ProviderPlayer, ProviderTournament, TennisProvider } from "@/lib/provider/types";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

import { refreshTour, syncTournaments } from "./matches";

const url = process.env.INTEGRATION_SUPABASE_URL;
const key = process.env.INTEGRATION_SUPABASE_KEY;
if (!url || !key || !/127\.0\.0\.1|localhost/.test(url)) {
  throw new Error("Integration tests need INTEGRATION_SUPABASE_URL/KEY pointing at a LOCAL Supabase");
}
const db = createClient<Database>(url, key, { auth: { persistSession: false } }) as unknown as AdminClient;

const T0 = new Date("2026-10-12T04:00:00Z");
const later = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

const tournament: ProviderTournament = {
  tour: "atp",
  providerId: 9319,
  name: "Test Masters",
  location: "Shanghai",
  surface: "Hard",
  category: "Masters 1000",
  season: 2026,
  startDate: "2026-10-07",
  endDate: "2026-10-18",
  drawSize: 96,
};

const player = (id: number, name: string): ProviderPlayer => ({
  tour: "atp",
  providerId: 90000 + id,
  firstName: name.split(" ")[0],
  lastName: name.split(" ")[1],
  fullName: name,
  countryCode: "ITA",
  countryName: "Italy",
  birthPlace: null,
  plays: null,
  heightCm: null,
  weightKg: null,
  turnedPro: null,
});

function m(id: number, over: Partial<ProviderMatch> = {}): ProviderMatch {
  return {
    tour: "atp",
    providerId: 95000 + id,
    tournament,
    season: 2026,
    round: "R32",
    player1: player(id * 2, `Alpha${id} Player`),
    player2: player(id * 2 + 1, `Beta${id} Player`),
    winner: null,
    status: "scheduled",
    resultDetail: null,
    isLive: false,
    score: null,
    sets: [],
    p1GameScore: null,
    p2GameScore: null,
    server: null,
    scheduledAt: "2026-10-12T06:00:00Z",
    notBeforeText: null,
    duration: null,
    ...over,
  };
}

const live1 = (games: number, points: string) =>
  m(1, {
    status: "in_progress",
    isLive: true,
    score: `6-4 ${games}-2`,
    sets: [
      { set: 1, p1: 6, p2: 4, p1Tiebreak: null, p2Tiebreak: null },
      { set: 2, p1: games, p2: 2, p1Tiebreak: null, p2Tiebreak: null },
    ],
    p1GameScore: points,
    p2GameScore: "0",
  });

/** Fake provider: tests set what each call returns, and count calls. */
function fakeProvider() {
  const state = { schedule: [] as ProviderMatch[], live: [] as ProviderMatch[], fail: null as ProviderError | null, calls: 0 };
  const p: TennisProvider = {
    name: "balldontlie",
    getRankings: async () => [],
    getPlayers: async () => [],
    getTournaments: async () => [tournament],
    getMatches: async () => {
      state.calls++;
      if (state.fail) throw state.fail;
      return state.schedule;
    },
    getLiveMatches: async () => {
      state.calls++;
      if (state.fail) throw state.fail;
      return state.live;
    },
  };
  return { p, state };
}

async function releaseLock() {
  await db.from("sync_state").update({ locked_until: null }).eq("key", "live:atp");
}

async function row(providerId: number) {
  const { data } = await db.from("matches").select("*").eq("provider_id", providerId).single();
  return data!;
}

async function cleanup() {
  await db.from("matches").delete().gte("provider_id", 95000);
  await db.from("tournaments").delete().eq("provider_id", 9319);
  await db.from("players").delete().gte("provider_id", 90000).lt("provider_id", 91000);
  await db.from("sync_state").delete().in("key", ["live:atp", "schedule:atp"]);
  await db.from("trial_observations").delete().gte("id", 0);
  await db.from("trial_polls").delete().gte("id", 0);
}

beforeAll(cleanup);
afterAll(cleanup);

describe("refreshTour", () => {
  let fake: ReturnType<typeof fakeProvider>;
  beforeEach(() => {
    fake = fakeProvider();
  });

  it("does a schedule refresh first, saving matches, players and tournaments", async () => {
    expect(await syncTournaments(db, fake.p, "atp", T0)).toBe(1);
    fake.state.schedule = [live1(2, "15"), m(2), m(3, { status: "final", winner: 2, score: "3-6 4-6" })];

    const r = await refreshTour(db, fake.p, "atp", T0);
    expect(r).toMatchObject({ status: "ok", kind: "schedule", matches: 3, live: 1 });

    const first = await row(95001);
    expect(first).toMatchObject({ is_live: true, status: "in_progress", player1_game_score: "15", score_changed_at: "2026-10-12T04:00:00+00:00" });
    expect(first.player1_id).not.toBeNull();
    const finished = await row(95003);
    expect(finished.winner_id).toBe(finished.player2_id);
  });

  it("refuses a second provider call while the lock is held", async () => {
    const r = await refreshTour(db, fake.p, "atp", later(5));
    expect(r.status).toBe("skipped");
    expect(fake.state.calls).toBe(0);
  });

  it("then refreshes live only, stamping score_changed_at only on real changes", async () => {
    await releaseLock();
    fake.state.live = [live1(2, "15")]; // unchanged
    expect(await refreshTour(db, fake.p, "atp", later(30))).toMatchObject({ status: "ok", kind: "live" });
    expect((await row(95001)).score_changed_at).toBe("2026-10-12T04:00:00+00:00");

    await releaseLock();
    fake.state.live = [live1(2, "30")]; // point won
    await refreshTour(db, fake.p, "atp", later(60));
    expect((await row(95001)).score_changed_at).toBe("2026-10-12T04:01:00+00:00");
  });

  it("clears the live flag when a match leaves the live feed and makes the next refresh a full one", async () => {
    await releaseLock();
    fake.state.live = [];
    await refreshTour(db, fake.p, "atp", later(90));
    expect((await row(95001)).is_live).toBe(false);

    await releaseLock();
    fake.state.schedule = [m(1, { status: "final", winner: 1, score: "6-4 6-2" })];
    expect(await refreshTour(db, fake.p, "atp", later(120))).toMatchObject({ kind: "schedule" });
    expect(await row(95001)).toMatchObject({ status: "final", score: "6-4 6-2" });
  });

  it("records a rejected key as unauthorized", async () => {
    await releaseLock();
    fake.state.fail = new ProviderError("BALLDONTLIE atp matches failed: HTTP 401", 401);
    expect(await refreshTour(db, fake.p, "atp", later(150))).toMatchObject({ status: "unauthorized" });
    const { data } = await db.from("sync_state").select("status").eq("key", "live:atp").single();
    expect(data!.status).toBe("unauthorized");
  });

  it("stores trial observations only when a live match changes", async () => {
    process.env.TRIAL_SAMPLING = "1";
    try {
      // Push the schedule refresh far away so these are live refreshes.
      await db.from("sync_state").update({ last_refreshed_at: later(200).toISOString() }).eq("key", "schedule:atp");
      for (const [t, points] of [
        [200, "15"],
        [230, "15"],
        [260, "30"],
      ] as const) {
        await releaseLock();
        fake.state.live = [live1(3, points)];
        await refreshTour(db, fake.p, "atp", later(t));
      }
      const { data: obs } = await db.from("trial_observations").select("games_state, point_state").order("observed_at");
      expect(obs).toEqual([
        { games_state: "6-4 3-2", point_state: "15-0" },
        { games_state: "6-4 3-2", point_state: "30-0" },
      ]);
      const { count } = await db.from("trial_polls").select("*", { count: "exact", head: true });
      expect(count).toBe(3);
    } finally {
      delete process.env.TRIAL_SAMPLING;
    }
  });
});
