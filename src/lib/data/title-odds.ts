import "server-only";

import { cache } from "react";

import { calibrate, newRating, normalizeSurface, winProbability, type Rating } from "@/lib/model/elo";
import { playerKey } from "@/lib/model/load";
import { createPublicClient } from "@/lib/supabase/public";
import { titleOdds } from "@/lib/title-odds";

import { getModelInfo } from "./predictions";

export interface TitleChance {
  key: string;
  id: number | null;
  name: string;
  countryCode: string | null;
  seed: string | null;
  /** Chance of winning at least r matches from here, r = 0…rounds. */
  reach: number[];
  title: number;
}

export interface TitleOdds {
  rounds: number;
  /** Players still in the draw, most likely champion first. */
  players: TitleChance[];
}

type Line = { p: number; name: string; id: number | null; country: string | null; seed: string | null };

/** Title chances for a tournament in progress, or null without a readable bracket or once decided. */
export const getTitleOdds = cache(async (tournamentId: number): Promise<TitleOdds | null> => {
  const db = createPublicClient();
  const [{ data: draw }, { data: t }, { data: results }, info] = await Promise.all([
    db.from("wiki_draws").select("bracket").eq("tournament_id", tournamentId).maybeSingle(),
    db.from("tournaments").select("tour, surface").eq("id", tournamentId).maybeSingle(),
    db
      .from("matches")
      .select("player1_id, player2_id, player1_name, player2_name, winner_side")
      .eq("tournament_id", tournamentId)
      .eq("status", "final")
      .eq("confirmed", true)
      .not("winner_side", "is", null),
    getModelInfo(),
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
  const keys = lines.map(keyOf);
  const ids = lines.map((l) => l.id).filter((id): id is number => id !== null);
  const [{ data: ratingRows }, { data: profiles }] = await Promise.all([
    db
      .from("player_ratings")
      .select("player_key, elo, elo_hard, elo_clay, elo_grass, matches, hard_matches, clay_matches, grass_matches")
      .eq("tour", t.tour)
      .in("player_key", keys),
    ids.length ? db.from("players").select("id, full_name, country_code").in("id", ids) : Promise.resolve({ data: [] }),
  ]);
  // Names and flags as on the rest of the site where the player has a profile.
  const profile = new Map((profiles ?? []).map((p) => [p.id, p]));
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
  const surface = normalizeSurface(t.surface);
  const c = info.calibration[t.tour] ?? 1;
  const pWin = (a: string, b: string) => calibrate(winProbability(ratings.get(a) ?? newRating(), ratings.get(b) ?? newRating(), surface), c);

  // Results name players the way the page does, so keys line up with the bracket.
  const played = (results ?? []).map((m) => {
    const k1 = playerKey(m.player1_id, m.player1_name);
    const k2 = playerKey(m.player2_id, m.player2_name);
    return m.winner_side === 1 ? { winner: k1, loser: k2 } : { winner: k2, loser: k1 };
  });

  const reach = titleOdds(bracket.size, lines.map((l) => ({ key: keyOf(l), position: l.p })), played, pWin);
  const rounds = Math.round(Math.log2(bracket.size));
  const players = lines
    .map((l): TitleChance => {
      const r = reach.get(keyOf(l)) ?? [];
      const pr = l.id !== null ? profile.get(l.id) : undefined;
      return { key: keyOf(l), id: l.id, name: pr?.full_name ?? l.name, countryCode: pr?.country_code ?? l.country, seed: l.seed, reach: r, title: r.at(-1) ?? 0 };
    })
    .filter((p) => p.title > 0)
    .sort((a, b) => b.title - a.title || a.name.localeCompare(b.name));
  // Decided (champion known) or unreadable: nothing to show.
  if (players.length < 2) return null;
  return { rounds, players };
});
