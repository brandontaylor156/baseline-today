import "server-only";

import { TOURS, type TennisProvider, type Tour } from "@/lib/provider/types";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

import { syncTournaments } from "./matches";
import { computeModel } from "./model";
import { runPhotoSync, type PhotoSyncSummary } from "./photos";
import { playerRow, profileRow, staleBefore } from "./rows";

const LOCK_KEY = "daily";
const LOCK_TTL_SECONDS = 15 * 60;
const RANKING_LIMIT = 100;
/** Profiles older than this are refreshed; one players call covers up to 100, so this is cheap. */
const PROFILE_MAX_AGE_DAYS = 7;
const PROFILE_BATCH = 100;
/** Wikimedia lookups per day; ~200 players are each rechecked about monthly. */
const PHOTO_BATCH = 40;

export interface TourSummary {
  tour: Tour;
  rankingDate: string | null;
  ranked: number;
  newPlayers: number;
  profilesRefreshed: number;
  tournaments: number;
}

export type DailySyncResult =
  | { status: "ok"; tours: TourSummary[]; photos: PhotoSyncSummary | { error: string }; model: { ok: true } | { error: string }; ms: number }
  | { status: "skipped"; reason: string }
  | { status: "error"; error: string; tours: TourSummary[]; ms: number };

function must<T>(result: { data: T | null; error: { message: string } | null }, what: string): T {
  if (result.error) throw new Error(`${what}: ${result.error.message}`);
  if (result.data === null) throw new Error(`${what}: no data returned`);
  return result.data;
}

async function syncTour(db: AdminClient, provider: TennisProvider, tour: Tour, now: Date): Promise<TourSummary> {
  const rankings = await provider.getRankings(tour, RANKING_LIMIT);
  const summary: TourSummary = {
    tour,
    rankingDate: rankings[0]?.rankingDate ?? null,
    ranked: 0,
    newPlayers: 0,
    profilesRefreshed: 0,
    tournaments: 0,
  };
  if (rankings.length === 0) return summary;

  // New players only: ranking rows can carry sparse player data that must not overwrite profiles.
  const inserted = must(
    await db
      .from("players")
      .upsert(rankings.map((r) => playerRow(r.player, provider.name)), {
        onConflict: "provider,tour,provider_id",
        ignoreDuplicates: true,
      })
      .select("id"),
    "insert players",
  );
  summary.newPlayers = inserted.length;

  const ids = must(
    await db
      .from("players")
      .select("id, provider_id")
      .eq("provider", provider.name)
      .eq("tour", tour)
      .in("provider_id", rankings.map((r) => r.player.providerId)),
    "look up player ids",
  );
  const idByProviderId = new Map(ids.map((p) => [p.provider_id, p.id]));

  const rankingRows = rankings.flatMap((r) => {
    const playerId = idByProviderId.get(r.player.providerId);
    return playerId === undefined
      ? []
      : [{ tour, ranking_date: r.rankingDate, player_id: playerId, rank: r.rank, points: r.points, movement: r.movement }];
  });
  const saved = await db.from("rankings").upsert(rankingRows, { onConflict: "tour,ranking_date,player_id" });
  if (saved.error) throw new Error(`save rankings: ${saved.error.message}`);
  summary.ranked = rankingRows.length;

  // Refresh never-fetched and stale profiles, oldest first.
  const stale = must(
    await db
      .from("players")
      .select("provider_id")
      .eq("provider", provider.name)
      .eq("tour", tour)
      .or(`profile_refreshed_at.is.null,profile_refreshed_at.lt.${staleBefore(now, PROFILE_MAX_AGE_DAYS)}`)
      .order("profile_refreshed_at", { ascending: true, nullsFirst: true })
      .limit(PROFILE_BATCH),
    "find stale profiles",
  );
  if (stale.length > 0) {
    const profiles = await provider.getPlayers(tour, stale.map((p) => p.provider_id));
    const savedProfiles = await db
      .from("players")
      .upsert(profiles.map((p) => profileRow(p, provider.name, now)), { onConflict: "provider,tour,provider_id" });
    if (savedProfiles.error) throw new Error(`save profiles: ${savedProfiles.error.message}`);
    summary.profilesRefreshed = profiles.length;
  }

  // Season calendar (free tier): tells the live refresh which tournaments are in play.
  summary.tournaments = await syncTournaments(db, provider, tour, now);

  return summary;
}

/** Daily job: rankings snapshot + new players + profile refresh, for both tours. */
export async function runDailySync(db: AdminClient, provider: TennisProvider, now = new Date()): Promise<DailySyncResult> {
  const locked = must(
    await db.rpc("try_acquire_sync_lock", { p_key: LOCK_KEY, p_ttl_seconds: LOCK_TTL_SECONDS }),
    "acquire lock",
  );
  if (!locked) return { status: "skipped", reason: "another daily sync is running" };

  const started = Date.now();
  const tours: TourSummary[] = [];
  let result: DailySyncResult;

  try {
    for (const tour of TOURS) tours.push(await syncTour(db, provider, tour, now));
    // Photos are best effort: a Wikimedia outage must not fail the rankings sync.
    const photos = await runPhotoSync(db, PHOTO_BATCH, now).catch((err: unknown) => ({
      error: err instanceof Error ? err.message : String(err),
    }));
    // Elo ratings and pre-match probabilities from every stored result; best effort too.
    const model = await computeModel(db, now)
      .then(() => ({ ok: true as const }))
      .catch((err: unknown) => ({ error: err instanceof Error ? err.message : String(err) }));
    result = { status: "ok", tours, photos, model, ms: Date.now() - started };
  } catch (err) {
    result = { status: "error", error: err instanceof Error ? err.message : String(err), tours, ms: Date.now() - started };
  }

  const { error } = await db
    .from("sync_state")
    .update({
      status: result.status,
      details: result as unknown as Json,
      locked_until: null,
      ...(result.status === "ok" ? { last_refreshed_at: now.toISOString() } : {}),
    })
    .eq("key", LOCK_KEY);
  if (error) console.error(`daily sync: failed to record state: ${error.message}`);

  return result;
}
