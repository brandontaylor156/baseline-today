import "server-only";

import { loadDrawModel } from "@/lib/data/title-odds";
import { titleChances } from "@/lib/draw-model";
import type { AdminClient } from "@/lib/supabase/admin";

const day = 24 * 60 * 60 * 1000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** A new snapshot only when someone's chance moved by at least this much (or the field changed). */
const MIN_CHANGE = 0.005;

export function oddsChanged(prev: Record<string, number> | null, next: Record<string, number>): boolean {
  if (!prev) return true;
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const k of keys) if (Math.abs((prev[k] ?? 0) - (next[k] ?? 0)) >= MIN_CHANGE) return true;
  return false;
}

/** Records title chances for tournaments in play whose chances moved since the last snapshot. */
export async function snapshotTitleOdds(db: AdminClient, now = new Date()): Promise<number> {
  const { data: model } = await db.from("sync_state").select("details").eq("key", "model").maybeSingle();
  const calibration = ((model?.details ?? {}) as { calibration?: Record<string, number> }).calibration ?? {};
  const { data: active, error } = await db
    .from("tournaments")
    .select("id, wiki_draws!inner(bracket)")
    .lte("start_date", isoDate(now))
    .gte("end_date", isoDate(new Date(now.getTime() - day)))
    .not("wiki_draws.bracket", "is", null);
  if (error) throw new Error(`snapshot tournaments: ${error.message}`);

  let saved = 0;
  for (const t of active ?? []) {
    const drawModel = await loadDrawModel(db, t.id, calibration);
    const odds = drawModel ? titleChances(drawModel) : null;
    if (!odds) continue;
    const next = Object.fromEntries(odds.players.map((p) => [p.key, Number(p.title.toFixed(4))]));
    const { data: last } = await db
      .from("title_odds_snapshots")
      .select("odds")
      .eq("tournament_id", t.id)
      .order("taken_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!oddsChanged((last?.odds as Record<string, number> | undefined) ?? null, next)) continue;
    const { error: insErr } = await db.from("title_odds_snapshots").insert({ tournament_id: t.id, taken_at: now.toISOString(), odds: next });
    if (insErr) throw new Error(`save snapshot: ${insErr.message}`);
    saved++;
  }
  return saved;
}
