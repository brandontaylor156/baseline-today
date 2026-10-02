import "server-only";

import { scoreBracket } from "@/lib/bracket-score";
import { loadDrawModel } from "@/lib/data/title-odds";
import type { AdminClient } from "@/lib/supabase/admin";
import type { PlayedResult } from "@/lib/title-odds";

const day = 24 * 60 * 60 * 1000;

/** Rescores Bracket Challenge entries for tournaments in play (and just finished). */
export async function scoreBrackets(db: AdminClient, now = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 3 * day).toISOString().slice(0, 10);
  const { data: entries, error } = await db
    .from("bracket_entries")
    .select("user_id, tournament_id, picks, score, max_score, tournaments!inner(end_date)")
    .gte("tournaments.end_date", since);
  if (error) throw new Error(`bracket entries: ${error.message}`);
  if (!entries?.length) return 0;

  const { data: state } = await db.from("sync_state").select("details").eq("key", "model").maybeSingle();
  const calibration = ((state?.details ?? {}) as { calibration?: Record<string, number> }).calibration ?? {};
  const models = new Map<number, Awaited<ReturnType<typeof loadDrawModel>>>();
  let updated = 0;
  for (const e of entries) {
    if (!models.has(e.tournament_id)) models.set(e.tournament_id, await loadDrawModel(db, e.tournament_id, calibration));
    const model = models.get(e.tournament_id);
    if (!model) continue;
    const picks = (Array.isArray(e.picks) ? e.picks : []) as { w?: string; l?: string }[];
    const { score, max } = scoreBracket(
      model,
      picks.filter((p): p is { w: string; l: string } => typeof p.w === "string" && typeof p.l === "string").map((p): PlayedResult => ({ winner: p.w, loser: p.l })),
    );
    if (score === e.score && max === e.max_score) continue;
    const { error: uErr } = await db.from("bracket_entries").update({ score, max_score: max }).eq("user_id", e.user_id).eq("tournament_id", e.tournament_id);
    if (uErr) throw new Error(`save bracket score: ${uErr.message}`);
    updated++;
  }
  return updated;
}
