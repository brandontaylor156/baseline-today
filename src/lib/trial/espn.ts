import "server-only";

import type { Tour } from "@/lib/provider/types";
import type { AdminClient } from "@/lib/supabase/admin";

import { parseEspnLive, type EspnScoreboard } from "./espn-parse";

const URL_FOR: Record<Tour, string> = {
  atp: "https://site.api.espn.com/apis/site/v2/sports/tennis/atp/scoreboard",
  wta: "https://site.api.espn.com/apis/site/v2/sports/tennis/wta/scoreboard",
};
const LOCK_SECONDS = 15;

/** Records ESPN's live games states (reference timing for the trial). Lock-bounded per tour. */
export async function sampleEspn(db: AdminClient, tour: Tour, now = new Date()) {
  const { data: locked } = await db.rpc("try_acquire_sync_lock", { p_key: `trial-espn:${tour}`, p_ttl_seconds: LOCK_SECONDS });
  if (!locked) return { tour, status: "skipped" as const };

  const started = Date.now();
  let status: number | null = null;
  try {
    const res = await fetch(URL_FOR[tour], { cache: "no-store", headers: { "User-Agent": "BaselineToday/1.0 (trial timing reference)" } });
    status = res.status;
    if (!res.ok) throw new Error(`ESPN HTTP ${res.status}`);
    const live = parseEspnLive((await res.json()) as EspnScoreboard, tour);

    await db.from("trial_polls").insert({
      source: "espn",
      tour,
      polled_at: now.toISOString(),
      http_status: status,
      latency_ms: Date.now() - started,
      live_count: live.length,
    });

    if (live.length) {
      const { data: last } = await db
        .from("trial_observations")
        .select("match_key, games_state")
        .eq("source", "espn")
        .eq("tour", tour)
        .in("match_key", live.map((m) => m.matchKey))
        .order("observed_at", { ascending: false })
        .limit(live.length * 20);
      const latest = new Map<string, string>();
      for (const o of last ?? []) if (!latest.has(o.match_key)) latest.set(o.match_key, o.games_state);

      const rows = live
        .filter((m) => latest.get(m.matchKey) !== m.gamesState)
        .map((m) => ({
          source: "espn",
          tour,
          match_key: m.matchKey,
          players_key: m.playersKey,
          games_state: m.gamesState,
          status: m.status,
          observed_at: now.toISOString(),
        }));
      if (rows.length) await db.from("trial_observations").insert(rows);
    }
    return { tour, status: "ok" as const, live: live.length };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await db.from("trial_polls").insert({ source: "espn", tour, polled_at: now.toISOString(), http_status: status, latency_ms: Date.now() - started, error });
    return { tour, status: "error" as const, error };
  }
}
