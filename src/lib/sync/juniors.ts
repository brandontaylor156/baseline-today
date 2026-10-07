import "server-only";

import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { normalizeName } from "@/lib/wiki/names";

import { loadMatches } from "./factors";

const STAGES = ["Champion", "Finalist", "Semifinals", "Quarterfinals", "Third round", "Second round", "First round"] as const;
type Stage = (typeof STAGES)[number];

export interface Junior {
  name: string;
  id: number | null;
  country: string | null;
  best: Stage;
  /** The junior Slam seasons played, and the titles won (event names). */
  firstSeason: number;
  lastSeason: number;
  titles: string[];
  tourWins: number;
  challengerWins: number;
}

export interface JuniorsCache {
  generated: string;
  cohortUntil: number;
  /** By best junior Slam result: players and how many reached 10+ tour-level wins. */
  conversion: Record<"boys" | "girls", { stage: Stage; players: number; made: number }[]>;
  champions: Record<"boys" | "girls", Junior[]>;
  draws: number;
}

/** The furthest a player went in one junior draw, from their matches in it (round labels from the page). */
function stageOf(rounds: { round: string; won: boolean }[]): Stage {
  const label = (r: string) => {
    const l = r.toLowerCase();
    if (/^final/.test(l)) return 0;
    if (/semi/.test(l)) return 1;
    if (/quarter/.test(l)) return 2;
    if (/third/.test(l)) return 3;
    if (/second/.test(l)) return 4;
    return 5;
  };
  const deepest = rounds.reduce((best, r) => (label(r.round) < label(best.round) ? r : best), rounds[0]);
  const d = label(deepest.round);
  if (d === 0) return deepest.won ? "Champion" : "Finalist";
  return (["Finalist", "Semifinals", "Quarterfinals", "Third round", "Second round", "First round"] as const)[d];
}

/**
 * Junior Grand Slam results since 2015, followed into the pros: conversion to 10+ tour-level wins by
 * the best junior result (for juniors whose last junior Slam was at least four seasons ago), and
 * every junior Slam champion's pro record so far. Stored in stat_cache as lab:juniors. Weekly.
 */
export async function computeJuniors(db: AdminClient, now = new Date()) {
  const cohortUntil = now.getUTCFullYear() - 5;
  const { matches, who } = await loadMatches(db);
  // WTA 125 events are a level below the tour (like the men's Challengers), so they don't count as tour-level.
  const below = new Set<number>();
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from("tournaments").select("id, category").order("id").range(from, from + 999);
    for (const t of data ?? []) if (/125/.test(t.category ?? "")) below.add(t.id);
    if (!data || data.length < 1000) break;
  }
  // Pro tour wins by normalized name (tour results use Wikipedia link targets, as junior draws do).
  const tourWins = new Map<string, number>();
  const profile = new Map<string, { id: number | null; country: string | null }>();
  for (const tour of ["atp", "wta"] as const) {
    for (const m of matches[tour]) {
      if (m.walkover || below.has(m.tournamentId)) continue;
      const winner = m.winner === 1 ? m.key1 : m.key2;
      const n = normalizeName(who.get(winner)?.name ?? "");
      tourWins.set(n, (tourWins.get(n) ?? 0) + 1);
    }
  }
  for (const [key, w] of who) {
    const n = normalizeName(w.name);
    if (!profile.has(n) || key.startsWith("id:")) profile.set(n, { id: w.id, country: w.country });
  }
  // Challenger wins by name.
  const challengerWins = new Map<string, number>();
  const juniorRows: { circuit: string; season: number; event: string; round: string; p1: string; p2: string; c1: string | null; c2: string | null; winner: number }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("challenger_matches")
      .select("round, player1_name, player2_name, player1_country, player2_country, winner_side, challenger_events!inner(circuit, season, name)")
      .in("winner_side", [1, 2])
      .order("id")
      .range(from, from + 999);
    if (error) throw new Error(`juniors: load: ${error.message}`);
    type R = { round: string | null; player1_name: string; player2_name: string; player1_country: string | null; player2_country: string | null; winner_side: number; challenger_events: { circuit: string; season: number; name: string } };
    for (const r of (data ?? []) as unknown as R[]) {
      if (r.challenger_events.circuit === "challenger") {
        const n = normalizeName(r.winner_side === 1 ? r.player1_name : r.player2_name);
        challengerWins.set(n, (challengerWins.get(n) ?? 0) + 1);
      } else {
        juniorRows.push({ circuit: r.challenger_events.circuit, season: r.challenger_events.season, event: r.challenger_events.name, round: r.round ?? "", p1: r.player1_name, p2: r.player2_name, c1: r.player1_country, c2: r.player2_country, winner: r.winner_side });
      }
    }
    if (!data || data.length < 1000) break;
  }

  const data: JuniorsCache = { generated: now.toISOString(), cohortUntil, conversion: { boys: [], girls: [] }, champions: { boys: [], girls: [] }, draws: new Set(juniorRows.map((r) => `${r.circuit}|${r.season}|${r.event}`)).size };
  for (const gender of ["boys", "girls"] as const) {
    // Per player: matches by draw.
    const byPlayer = new Map<string, { name: string; country: string | null; draws: Map<string, { season: number; event: string; rounds: { round: string; won: boolean }[] }> }>();
    for (const r of juniorRows.filter((x) => x.circuit === `junior-${gender}`)) {
      for (const side of [1, 2] as const) {
        const name = side === 1 ? r.p1 : r.p2;
        const n = normalizeName(name);
        const p = byPlayer.get(n) ?? { name, country: side === 1 ? r.c1 : r.c2, draws: new Map() };
        const k = `${r.season}|${r.event}`;
        const d = p.draws.get(k) ?? { season: r.season, event: r.event, rounds: [] };
        d.rounds.push({ round: r.round, won: r.winner === side });
        p.draws.set(k, d);
        byPlayer.set(n, p);
      }
    }
    const juniors: Junior[] = [...byPlayer].map(([n, p]) => {
      const stages = [...p.draws.values()].map((d) => ({ ...d, stage: stageOf(d.rounds) }));
      const best = stages.reduce((b, s) => (STAGES.indexOf(s.stage) < STAGES.indexOf(b) ? s.stage : b), "First round" as Stage);
      const prof = profile.get(n);
      return {
        name: p.name,
        id: prof?.id ?? null,
        country: prof?.country ?? p.country,
        best,
        firstSeason: Math.min(...stages.map((s) => s.season)),
        lastSeason: Math.max(...stages.map((s) => s.season)),
        titles: stages.filter((s) => s.stage === "Champion").map((s) => `${s.event.replace(/ – .*$/, "")} ${s.season}`),
        tourWins: tourWins.get(n) ?? 0,
        challengerWins: challengerWins.get(n) ?? 0,
      };
    });
    data.conversion[gender] = STAGES.map((stage) => {
      const xs = juniors.filter((j) => j.best === stage && j.lastSeason <= cohortUntil);
      return { stage, players: xs.length, made: xs.filter((j) => j.tourWins >= 10).length };
    });
    data.champions[gender] = juniors.filter((j) => j.titles.length > 0).sort((a, b) => b.firstSeason - a.firstSeason || b.tourWins - a.tourWins);
  }
  const { error } = await db.from("stat_cache").upsert({ key: "lab:juniors", data: data as unknown as Json });
  if (error) throw new Error(`juniors: ${error.message}`);
  return Object.fromEntries(
    (["boys", "girls"] as const).map((g) => [g, data.conversion[g].map((c) => `${c.stage} ${c.made}/${c.players}`).join(" | ")]),
  );
}
