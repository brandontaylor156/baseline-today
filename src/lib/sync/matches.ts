import "server-only";

import { trialSamplingEnabled as trialSampling } from "@/lib/features";
import { ProviderError } from "@/lib/provider/balldontlie";
import type { ProviderMatch, ProviderPlayer, TennisProvider, Tour } from "@/lib/provider/types";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

import { activeWindow, matchRow, orientedGamesState, playersKey, scoreSignature, tournamentRow } from "./match-rows";
import { playerRow } from "./rows";

/** Minimum spacing of provider calls per tour, whoever triggers the refresh (visitors, cron). */
export const LIVE_LOCK_SECONDS = 20;
/** Full schedule refresh (all matches of tournaments in play) at most this often. */
export const SCHEDULE_EVERY_MINUTES = 15;
/** Page visits trigger a refresh when live data is older than this… */
export const STALE_LIVE_SECONDS = 2 * 60;
/** …or this, when nothing is in progress. */
export const STALE_IDLE_SECONDS = 15 * 60;

export type RefreshKind = "live" | "schedule";
export type TourRefresh =
  | { tour: Tour; status: "ok"; kind: RefreshKind; matches: number; live: number; ms: number }
  | { tour: Tour; status: "skipped"; reason: string }
  | { tour: Tour; status: "unauthorized" | "error"; error: string };

function fail(what: string, error: { message: string } | null) {
  if (error) throw new Error(`${what}: ${error.message}`);
}

async function ensurePlayers(db: AdminClient, tour: Tour, provider: string, players: ProviderPlayer[]) {
  const unique = [...new Map(players.map((p) => [p.providerId, p])).values()];
  if (unique.length === 0) return new Map<number, number>();
  // New players only; existing profiles are refreshed by the daily job.
  const ins = await db
    .from("players")
    .upsert(unique.map((p) => playerRow(p, provider)), { onConflict: "provider,tour,provider_id", ignoreDuplicates: true });
  fail("insert match players", ins.error);
  const { data, error } = await db
    .from("players")
    .select("id, provider_id")
    .eq("provider", provider)
    .eq("tour", tour)
    .in("provider_id", unique.map((p) => p.providerId));
  fail("look up match players", error);
  return new Map((data ?? []).map((p) => [p.provider_id, p.id]));
}

/** Upserts matches (and their tournaments/players), stamping score_changed_at only on real changes. */
async function saveMatches(db: AdminClient, tour: Tour, provider: string, matches: ProviderMatch[], now: Date) {
  if (matches.length === 0) return;

  const tournaments = [...new Map(matches.map((m) => [m.tournament.providerId, m.tournament])).values()];
  const { data: tRows, error: tErr } = await db
    .from("tournaments")
    .upsert(tournaments.map((t) => tournamentRow(t, provider, now)), { onConflict: "provider,tour,provider_id" })
    .select("id, provider_id");
  fail("save tournaments", tErr);
  const tournamentIds = new Map((tRows ?? []).map((t) => [t.provider_id, t.id]));

  const playerIds = await ensurePlayers(
    db,
    tour,
    provider,
    matches.flatMap((m) => [m.player1, m.player2]).filter((p): p is ProviderPlayer => p !== null),
  );

  const { data: existing, error: exErr } = await db
    .from("matches")
    .select("provider_id, status, score, set_scores, player1_game_score, player2_game_score, score_changed_at")
    .eq("provider", provider)
    .eq("tour", tour)
    .in("provider_id", matches.map((m) => m.providerId));
  fail("read existing matches", exErr);
  const before = new Map((existing ?? []).map((e) => [e.provider_id, e]));

  const rows = matches.flatMap((m) => {
    const tournamentId = tournamentIds.get(m.tournament.providerId);
    if (tournamentId === undefined) return [];
    const row = matchRow(
      m,
      provider,
      {
        tournamentId,
        player1Id: m.player1 ? (playerIds.get(m.player1.providerId) ?? null) : null,
        player2Id: m.player2 ? (playerIds.get(m.player2.providerId) ?? null) : null,
      },
      now,
    );
    const prev = before.get(m.providerId);
    const changed =
      !prev ||
      scoreSignature(prev) !==
        scoreSignature({
          status: row.status ?? "unknown",
          score: row.score ?? null,
          set_scores: row.set_scores ?? [],
          player1_game_score: row.player1_game_score ?? null,
          player2_game_score: row.player2_game_score ?? null,
        });
    return [{ ...row, score_changed_at: changed ? now.toISOString() : prev.score_changed_at }];
  });

  const saved = await db.from("matches").upsert(rows, { onConflict: "provider,tour,provider_id" });
  fail("save matches", saved.error);
}

async function recordTrialPoll(
  db: AdminClient,
  tour: Tour,
  poll: { status: number | null; ms: number; live?: ProviderMatch[]; error?: string },
  now: Date,
) {
  if (!trialSampling()) return;
  await db.from("trial_polls").insert({
    source: "balldontlie",
    tour,
    polled_at: now.toISOString(),
    http_status: poll.status,
    latency_ms: poll.ms,
    live_count: poll.live?.length ?? null,
    error: poll.error ?? null,
  });
  if (!poll.live?.length) return;

  // Store an observation only when a live singles match shows a new state.
  const keys = poll.live.map((m) => String(m.providerId));
  const { data: last } = await db
    .from("trial_observations")
    .select("match_key, games_state, point_state, status, observed_at")
    .eq("source", "balldontlie")
    .eq("tour", tour)
    .in("match_key", keys)
    .order("observed_at", { ascending: false })
    .limit(keys.length * 20);
  const latest = new Map<string, { games_state: string; point_state: string | null; status: string | null }>();
  for (const o of last ?? []) if (!latest.has(o.match_key)) latest.set(o.match_key, o);

  const rows = poll.live.flatMap((m) => {
    if (!m.player1 || !m.player2) return [];
    const { key, flipped } = playersKey(m.player1.fullName, m.player2.fullName);
    const games = orientedGamesState(m.sets, flipped);
    const points = m.p1GameScore || m.p2GameScore ? (flipped ? `${m.p2GameScore}-${m.p1GameScore}` : `${m.p1GameScore}-${m.p2GameScore}`) : null;
    const prev = latest.get(String(m.providerId));
    if (prev && prev.games_state === games && prev.point_state === points && prev.status === m.status) return [];
    return [
      {
        source: "balldontlie",
        tour,
        match_key: String(m.providerId),
        players_key: key,
        games_state: games,
        point_state: points,
        status: m.status,
        observed_at: now.toISOString(),
      },
    ];
  });
  if (rows.length) await db.from("trial_observations").insert(rows);
}

async function scheduleDue(db: AdminClient, tour: Tour, now: Date): Promise<boolean> {
  const { data } = await db.from("sync_state").select("last_refreshed_at").eq("key", `schedule:${tour}`).maybeSingle();
  const last = data?.last_refreshed_at ? Date.parse(data.last_refreshed_at) : 0;
  return now.getTime() - last >= SCHEDULE_EVERY_MINUTES * 60 * 1000;
}

/**
 * One refresh for a tour: a full schedule refresh when due, otherwise live matches only.
 * Guarded by a lock so concurrent triggers make at most one provider call per LIVE_LOCK_SECONDS.
 */
export async function refreshTour(db: AdminClient, provider: TennisProvider, tour: Tour, now = new Date()): Promise<TourRefresh> {
  const { data: locked, error: lockErr } = await db.rpc("try_acquire_sync_lock", {
    p_key: `live:${tour}`,
    p_ttl_seconds: LIVE_LOCK_SECONDS,
  });
  if (lockErr) return { tour, status: "error", error: lockErr.message };
  if (!locked) return { tour, status: "skipped", reason: "refreshed moments ago" };

  const started = Date.now();
  const kind: RefreshKind = (await scheduleDue(db, tour, now)) ? "schedule" : "live";

  try {
    let matches: ProviderMatch[];
    if (kind === "schedule") {
      const { from, to } = activeWindow(now);
      const { data: active, error } = await db
        .from("tournaments")
        .select("provider_id")
        .eq("tour", tour)
        .eq("provider", provider.name)
        .lte("start_date", to)
        .gte("end_date", from);
      fail("find active tournaments", error);
      matches = await provider.getMatches(tour, (active ?? []).map((t) => t.provider_id));
    } else {
      matches = await provider.getLiveMatches(tour);
    }
    const live = matches.filter((m) => m.isLive);

    await saveMatches(db, tour, provider.name, matches, now);

    // Matches that dropped out of the live feed have finished or paused: clear their live flag
    // and make the next refresh a full schedule refresh so their final state arrives quickly.
    const liveIds = live.map((m) => m.providerId);
    const { data: dropped } = await db
      .from("matches")
      .update({ is_live: false, updated_at: now.toISOString() })
      .eq("tour", tour)
      .eq("is_live", true)
      .not("provider_id", "in", `(${liveIds.length ? liveIds.join(",") : "0"})`)
      .select("id");

    await db.from("sync_state").upsert({
      key: `schedule:${tour}`,
      ...(kind === "schedule"
        ? { last_refreshed_at: now.toISOString(), status: "ok" }
        : dropped?.length
          ? { last_refreshed_at: null }
          : {}),
    });
    await db
      .from("sync_state")
      .update({ last_refreshed_at: now.toISOString(), status: "ok", details: { kind, live: live.length } as Json })
      .eq("key", `live:${tour}`);

    await recordTrialPoll(db, tour, { status: 200, ms: Date.now() - started, live }, now);
    return { tour, status: "ok", kind, matches: matches.length, live: live.length, ms: Date.now() - started };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof ProviderError ? (err.status ?? null) : null;
    const unauthorized = status === 401 || status === 403;
    await db
      .from("sync_state")
      .update({ status: unauthorized ? "unauthorized" : "error", details: { error: message } as Json })
      .eq("key", `live:${tour}`);
    await recordTrialPoll(db, tour, { status, ms: Date.now() - started, error: message }, now);
    return { tour, status: unauthorized ? "unauthorized" : "error", error: message };
  }
}

/** Daily: store this season's tournaments for both tours (free tier). */
export async function syncTournaments(db: AdminClient, provider: TennisProvider, tour: Tour, now = new Date()) {
  const season = now.getUTCFullYear();
  const tournaments = await provider.getTournaments(tour, season);
  if (tournaments.length === 0) return 0;
  const saved = await db
    .from("tournaments")
    .upsert(tournaments.map((t) => tournamentRow(t, provider.name, now)), { onConflict: "provider,tour,provider_id" });
  fail("save tournaments", saved.error);
  return tournaments.length;
}
