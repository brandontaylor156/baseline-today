import "server-only";

import { forecast } from "@/lib/lab/forecast";
import { bestOfFive, calibrate, newRating, winProbability, type Rating, type Surface } from "@/lib/model/elo";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

const DRAWS = 200;
const SURFACES: Surface[] = ["hard", "clay", "grass"];

export interface ForecastPlayer {
  id: number;
  name: string;
  country: string | null;
  seed: number | null;
  /** reach[r]: chance of winning at least r matches (7 = title). */
  reach: number[];
}

/**
 * "If a major started today": a 128-player field (this week's top 100, then the best-rated
 * active players), the top 32 seeded by ranking, many random draws per surface, each solved
 * exactly. Stored in stat_cache as forecast:<tour>.
 */
export async function computeForecast(db: AdminClient, now = new Date()) {
  const { data: model } = await db.from("sync_state").select("details").eq("key", "model").maybeSingle();
  const calibration = ((model?.details ?? {}) as { calibration?: Record<string, number> }).calibration ?? {};
  const out: Record<string, number> = {};
  for (const tour of ["atp", "wta"] as const) {
    const { data: dates } = await db.rpc("ranking_dates", { p_tour: tour });
    const latest = (dates ?? [])[0];
    const [{ data: ranks }, { data: rated }] = await Promise.all([
      db.from("rankings").select("player_id, rank").eq("tour", tour).eq("ranking_date", latest).order("rank").limit(100),
      db
        .from("player_ratings")
        .select("player_id, elo, elo_hard, elo_clay, elo_grass, matches, hard_matches, clay_matches, grass_matches, players!inner(full_name, country_code)")
        .eq("tour", tour)
        .not("player_id", "is", null)
        .gte("last_played", new Date(now.getTime() - 180 * 86_400_000).toISOString().slice(0, 10))
        .order("elo", { ascending: false })
        .limit(400),
    ]);
    type R = { player_id: number; elo: number; elo_hard: number; elo_clay: number; elo_grass: number; matches: number; hard_matches: number; clay_matches: number; grass_matches: number; players: { full_name: string; country_code: string | null } };
    const byId = new Map(((rated ?? []) as unknown as R[]).map((r) => [r.player_id, r]));
    const ranked = (ranks ?? []).map((r) => r.player_id).filter((id) => byId.has(id));
    const extra = [...byId.keys()].filter((id) => !ranked.includes(id));
    const field = [...ranked, ...extra].slice(0, 128);
    if (field.length < 128) continue;
    const rating = (id: number): Rating => {
      const r = byId.get(id);
      return r
        ? { overall: r.elo, surface: { hard: r.elo_hard, clay: r.elo_clay, grass: r.elo_grass }, matches: r.matches, surfaceMatches: { hard: r.hard_matches, clay: r.clay_matches, grass: r.grass_matches } }
        : newRating();
    };
    const c = calibration[tour] ?? 1;
    const result: Record<string, ForecastPlayer[]> = {};
    for (const surface of SURFACES) {
      const p = (a: string, b: string) => {
        const q = calibrate(winProbability(rating(Number(a)), rating(Number(b)), surface), c);
        return tour === "atp" ? bestOfFive(q) : q;
      };
      const reach = forecast(field.map(String), p, DRAWS, surface.length * 7 + (tour === "atp" ? 1 : 2));
      result[surface] = field
        .map((id, i) => ({ id, name: byId.get(id)!.players.full_name, country: byId.get(id)!.players.country_code, seed: i < 32 ? i + 1 : null, reach: (reach.get(String(id)) ?? []).map((x) => Math.round(x * 10000) / 10000) }))
        .sort((a, b) => (b.reach.at(-1) ?? 0) - (a.reach.at(-1) ?? 0))
        .slice(0, 32);
    }
    const { error } = await db.from("stat_cache").upsert({ key: `forecast:${tour}`, data: { generated: now.toISOString(), draws: DRAWS, field: field.length, surfaces: result } as unknown as Json });
    if (error) throw new Error(`forecast: ${error.message}`);
    out[tour] = field.length;
  }
  return out;
}
