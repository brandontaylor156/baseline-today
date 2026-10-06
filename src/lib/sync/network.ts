import "server-only";

import { pageRank, type Win } from "@/lib/lab/network";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

import { loadMatches } from "./factors";

export interface PrestigeRow {
  key: string;
  id: number | null;
  name: string;
  country: string | null;
  /** PageRank share ×1000 over the last 52 weeks, and the player's rank by it. */
  prestige: number;
  wins: number;
}

export interface NetworkCache {
  generated: string;
  tours: Record<
    string,
    {
      prestige: PrestigeRow[];
      /** Picking the winner of each season's matches from the previous 52 weeks: PageRank, raw win counts, and the rating model. */
      test: { matches: number; pageRank: number; winCount: number; model: number };
    }
  >;
}

/** Edges for the chain finder: [winner id, loser id, match id], the latest meeting per direction, linked players only. */
export interface ChainCache {
  generated: string;
  names: Record<string, string>;
  edges: [number, number, number][];
}

/**
 * Prestige (PageRank on the last 52 weeks of wins), an honest test against the ratings, and the
 * edges for the win-chain finder. Stored in stat_cache as lab:network and lab:chains. Weekly.
 */
export async function computeNetwork(db: AdminClient, now = new Date()) {
  const { matches, who } = await loadMatches(db);
  const today = now.toISOString().slice(0, 10);
  const yearAgo = new Date(now.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
  const data: NetworkCache = { generated: now.toISOString(), tours: {} };
  const chains: ChainCache = { generated: now.toISOString(), names: {}, edges: [] };
  const latest = new Map<string, [number, number, number, string]>();

  for (const tour of ["atp", "wta"] as const) {
    const ms = matches[tour].filter((m) => !m.walkover);
    const winsOf = (from: string, to: string): Win[] =>
      ms.filter((m) => m.startDate >= from && m.startDate < to).map((m) => ({ winner: m.winner === 1 ? m.key1 : m.key2, loser: m.winner === 1 ? m.key2 : m.key1, matchId: m.id }));

    const recent = winsOf(yearAgo, today);
    const pr = pageRank(recent);
    const count = new Map<string, number>();
    for (const w of recent) count.set(w.winner, (count.get(w.winner) ?? 0) + 1);
    const prestige = [...pr]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([key, v]): PrestigeRow => {
        const w = who.get(key);
        return { key, id: w?.id ?? null, name: w?.name ?? key, country: w?.country ?? null, prestige: Math.round(v * 100000) / 100, wins: count.get(key) ?? 0 };
      });

    // The test: each season from 2017, predicted from the 52 weeks before it.
    let n = 0;
    let byRank = 0;
    let byCount = 0;
    let byModel = 0;
    for (let y = 2017; y <= now.getUTCFullYear(); y++) {
      const train = winsOf(`${y - 1}-01-01`, `${y}-01-01`);
      const r = pageRank(train);
      const c = new Map<string, number>();
      for (const w of train) c.set(w.winner, (c.get(w.winner) ?? 0) + 1);
      for (const m of ms) {
        if (!m.startDate.startsWith(String(y)) || !r.has(m.key1) || !r.has(m.key2) || !Number.isFinite(m.p1)) continue;
        const p1Won = m.winner === 1;
        n++;
        byRank += (r.get(m.key1)! > r.get(m.key2)!) === p1Won ? 1 : 0;
        const c1 = c.get(m.key1) ?? 0;
        const c2 = c.get(m.key2) ?? 0;
        byCount += c1 === c2 ? 0.5 : (c1 > c2) === p1Won ? 1 : 0;
        byModel += (m.p1 > 0.5) === p1Won ? 1 : 0;
      }
    }
    data.tours[tour] = { prestige, test: { matches: n, pageRank: byRank / Math.max(1, n), winCount: byCount / Math.max(1, n), model: byModel / Math.max(1, n) } };

    // Chain edges between players with profiles: the latest meeting in each direction.
    for (const m of ms) {
      if (!m.key1.startsWith("id:") || !m.key2.startsWith("id:") || m.id === undefined) continue;
      const w = Number((m.winner === 1 ? m.key1 : m.key2).slice(3));
      const l = Number((m.winner === 1 ? m.key2 : m.key1).slice(3));
      const k = `${w}|${l}`;
      const prev = latest.get(k);
      if (!prev || m.startDate > prev[3]) latest.set(k, [w, l, m.id, m.startDate]);
      for (const key of [m.key1, m.key2]) chains.names[key.slice(3)] = who.get(key)?.name ?? key;
    }
  }
  chains.edges = [...latest.values()].map(([w, l, id]) => [w, l, id]);

  const [{ error }, { error: e2 }] = await Promise.all([
    db.from("stat_cache").upsert({ key: "lab:network", data: data as unknown as Json }),
    db.from("stat_cache").upsert({ key: "lab:chains", data: chains as unknown as Json }),
  ]);
  if (error || e2) throw new Error(`network: ${(error ?? e2)!.message}`);
  return Object.fromEntries(
    Object.entries(data.tours).map(([t, v]) => [t, `PR ${(v.test.pageRank * 100).toFixed(1)}% / wins ${(v.test.winCount * 100).toFixed(1)}% / model ${(v.test.model * 100).toFixed(1)}% on ${v.test.matches}; top ${v.prestige.slice(0, 3).map((p) => p.name).join(", ")}`]),
  );
}
