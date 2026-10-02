import "server-only";

import { cache } from "react";

import { titleChances, type DrawModel, type TitleOdds } from "@/lib/draw-model";
import { normalizeSurface, type Rating } from "@/lib/model/elo";
import { playerKey } from "@/lib/model/load";
import type { AdminClient } from "@/lib/supabase/admin";
import { createPublicClient } from "@/lib/supabase/public";

import { getModelInfo } from "./predictions";

export type { TitleChance, TitleOdds } from "@/lib/draw-model";

type Line = { p: number; name: string; id: number | null; country: string | null; seed: string | null };
type Db = AdminClient | ReturnType<typeof createPublicClient>;

/** Loads a draw (bracket, confirmed results, ratings) for title odds; null without a readable bracket. */
export async function loadDrawModel(db: Db, tournamentId: number, calibration: Record<string, number>): Promise<DrawModel | null> {
  const [{ data: draw }, { data: t }, { data: results }] = await Promise.all([
    db.from("wiki_draws").select("bracket").eq("tournament_id", tournamentId).maybeSingle(),
    db.from("tournaments").select("tour, surface, category").eq("id", tournamentId).maybeSingle(),
    db
      .from("matches")
      .select("player1_id, player2_id, player1_name, player2_name, winner_side")
      .eq("tournament_id", tournamentId)
      .eq("status", "final")
      .eq("confirmed", true)
      .not("winner_side", "is", null),
  ]);
  const bracket = draw?.bracket as { size?: number; lines?: Line[] } | null;
  if (!t || !bracket?.size || !bracket.lines?.length) return null;

  // Players linked to a profile after the bracket was stored: take the id from their results.
  const idByName = new Map<string, number>();
  for (const m of results ?? []) {
    if (m.player1_id !== null && m.player1_name) idByName.set(m.player1_name, m.player1_id);
    if (m.player2_id !== null && m.player2_name) idByName.set(m.player2_name, m.player2_id);
  }
  const lines = bracket.lines.map((l) => (l.id === null && idByName.has(l.name) ? { ...l, id: idByName.get(l.name)! } : l));
  const keyOf = (l: Line) => playerKey(l.id, l.name);
  const ids = lines.map((l) => l.id).filter((id): id is number => id !== null);
  const [{ data: ratingRows }, { data: profiles }] = await Promise.all([
    db
      .from("player_ratings")
      .select("player_key, elo, elo_hard, elo_clay, elo_grass, matches, hard_matches, clay_matches, grass_matches")
      .eq("tour", t.tour)
      .in("player_key", lines.map(keyOf)),
    ids.length ? db.from("players").select("id, full_name, country_code").in("id", ids) : Promise.resolve({ data: [] }),
  ]);
  const ratings = new Map<string, Rating>(
    (ratingRows ?? []).map((r) => [
      r.player_key,
      {
        overall: r.elo,
        surface: { hard: r.elo_hard, clay: r.elo_clay, grass: r.elo_grass },
        matches: r.matches,
        surfaceMatches: { hard: r.hard_matches, clay: r.clay_matches, grass: r.grass_matches },
      },
    ]),
  );
  // Names and flags as on the rest of the site where the player has a profile.
  const profile = new Map((profiles ?? []).map((p) => [p.id, p]));

  return {
    tournamentId,
    size: bracket.size,
    rounds: Math.round(Math.log2(bracket.size)),
    surface: normalizeSurface(t.surface),
    calibration: calibration[t.tour] ?? 1,
    bestOf: t.tour === "atp" && /grand slam/i.test(t.category ?? "") ? 5 : 3,
    players: lines.map((l) => {
      const pr = l.id !== null ? profile.get(l.id) : undefined;
      return {
        key: keyOf(l),
        id: l.id,
        name: pr?.full_name ?? l.name,
        countryCode: pr?.country_code ?? l.country,
        seed: l.seed,
        position: l.p,
        rating: ratings.get(keyOf(l)) ?? null,
      };
    }),
    // Results name players the way the page does, so keys line up with the bracket.
    played: (results ?? []).map((m) => {
      const k1 = playerKey(m.player1_id, m.player1_name);
      const k2 = playerKey(m.player2_id, m.player2_name);
      return m.winner_side === 1 ? { winner: k1, loser: k2 } : { winner: k2, loser: k1 };
    }),
  };
}

/** The draw model for pages (through the data cache). */
export const getDrawModel = cache(async (tournamentId: number): Promise<DrawModel | null> => {
  const info = await getModelInfo();
  return loadDrawModel(createPublicClient(), tournamentId, info.calibration);
});

/** Title chances for a tournament in progress, or null without a readable bracket or once decided. */
export const getTitleOdds = cache(async (tournamentId: number): Promise<TitleOdds | null> => {
  const model = await getDrawModel(tournamentId);
  return model ? titleChances(model) : null;
});

/** Title-chance history of the current top contenders (from the snapshots), for small multiples. */
export const getTitleHistory = cache(async (tournamentId: number, model: DrawModel, top = 6) => {
  const { data } = await createPublicClient()
    .from("title_odds_snapshots")
    .select("taken_at, odds")
    .eq("tournament_id", tournamentId)
    .order("taken_at");
  const snaps = (data ?? []).map((s) => ({ at: s.taken_at, odds: s.odds as Record<string, number> }));
  const latest = snaps.at(-1);
  if (!latest) return { times: [], series: [] };
  const byKey = new Map(model.players.map((p) => [p.key, p]));
  const keys = Object.entries(latest.odds)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([k]) => k);
  return {
    times: snaps.map((s) => s.at),
    series: keys.map((k) => ({
      key: k,
      name: byKey.get(k)?.name ?? k.replace(/^name:/, ""),
      countryCode: byKey.get(k)?.countryCode ?? null,
      points: snaps.map((s) => ({ at: s.at, p: s.odds[k] ?? 0 })),
    })),
  };
});
