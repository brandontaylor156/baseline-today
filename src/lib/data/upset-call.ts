import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { createPublicClient } from "@/lib/supabase/public";

import { getUpcoming } from "./predictions";
import { displayName } from "./tournaments";

export interface UpsetCall {
  day: string;
  matchId: number;
  tour: string;
  tournament: string;
  round: string | null;
  underdog: { id: number | null; name: string; side: 1 | 2 };
  favorite: { id: number | null; name: string };
  /** The model's chance for the underdog. */
  underdogChance: number;
}

/**
 * The day's featured match: an upcoming match the model leans on (favorite 60–82%), between the
 * best-ranked pair. The first pick of a day is stored, so it doesn't change as draws update.
 */
export async function getUpsetCall(day: string, now = new Date()): Promise<UpsetCall | null> {
  const key = `upset-call:${day}`;
  const { data: cached } = await createPublicClient({ cached: false }).from("stat_cache").select("data").eq("key", key).maybeSingle();
  if (cached) return cached.data as unknown as UpsetCall;

  const { matchups } = await getUpcoming(now);
  const candidates = matchups
    .filter((m) => (!m.scheduledAt || Date.parse(m.scheduledAt) > now.getTime()) && m.p1.id !== null && m.p2.id !== null)
    .map((m) => ({ m, fav: Math.max(m.model1, 1 - m.model1) }))
    .filter(({ fav }) => fav >= 0.6 && fav <= 0.82)
    .sort((a, b) => (a.m.p1.rank ?? 300) + (a.m.p2.rank ?? 300) - ((b.m.p1.rank ?? 300) + (b.m.p2.rank ?? 300)) || a.m.id - b.m.id);
  const pick = candidates[0]?.m;
  if (!pick) return null;
  const side: 1 | 2 = pick.model1 < 0.5 ? 1 : 2;
  const call: UpsetCall = {
    day,
    matchId: pick.id,
    tour: pick.tour,
    tournament: displayName(pick.tournament.name),
    round: pick.round,
    underdog: { id: (side === 1 ? pick.p1 : pick.p2).id, name: (side === 1 ? pick.p1 : pick.p2).name, side },
    favorite: { id: (side === 1 ? pick.p2 : pick.p1).id, name: (side === 1 ? pick.p2 : pick.p1).name },
    underdogChance: side === 1 ? pick.model1 : 1 - pick.model1,
  };
  if (process.env.SUPABASE_SECRET_KEY) {
    // First writer wins; a concurrent request keeps the stored pick.
    await createAdminClient().from("stat_cache").upsert({ key, data: call as unknown as Json }, { onConflict: "key", ignoreDuplicates: true });
    const { data: stored } = await createPublicClient({ cached: false }).from("stat_cache").select("data").eq("key", key).maybeSingle();
    if (stored) return stored.data as unknown as UpsetCall;
  }
  return call;
}
