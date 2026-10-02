// One-off: title-odds history for tournaments in play, replaying their results in the order they
// were reported (current ratings throughout).   npx tsx --env-file=.env.local --conditions=react-server scripts/backfill-title-odds.mts
import { loadDrawModel } from "@/lib/data/title-odds";
import { titleChances } from "@/lib/draw-model";
import { playerKey } from "@/lib/model/load";
import { createAdminClient } from "@/lib/supabase/admin";
import { oddsChanged } from "@/lib/sync/title-snapshots";

const db = createAdminClient();
const today = new Date().toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const { data: state } = await db.from("sync_state").select("details").eq("key", "model").maybeSingle();
const calibration = ((state?.details ?? {}) as { calibration?: Record<string, number> }).calibration ?? {};
const { data: active } = await db
  .from("tournaments")
  .select("id, name, start_date, wiki_draws!inner(bracket)")
  .lte("start_date", today)
  .gte("end_date", yesterday)
  .not("wiki_draws.bracket", "is", null);

for (const t of active ?? []) {
  const model = await loadDrawModel(db, t.id, calibration);
  if (!model) continue;
  const { data: results } = await db
    .from("matches")
    .select("player1_id, player2_id, player1_name, player2_name, winner_side, score_changed_at")
    .eq("tournament_id", t.id)
    .eq("status", "final")
    .eq("confirmed", true)
    .not("winner_side", "is", null)
    .order("score_changed_at");
  const timed = (results ?? []).map((m) => {
    const k1 = playerKey(m.player1_id, m.player1_name);
    const k2 = playerKey(m.player2_id, m.player2_name);
    return { at: m.score_changed_at ?? `${t.start_date}T00:00:00Z`, r: m.winner_side === 1 ? { winner: k1, loser: k2 } : { winner: k2, loser: k1 } };
  });
  const times = [`${t.start_date}T00:00:00.000Z`, ...new Set(timed.map((x) => new Date(x.at).toISOString()))];
  let prev: Record<string, number> | null = null;
  const rows: { tournament_id: number; taken_at: string; odds: Record<string, number> }[] = [];
  for (const at of times) {
    const odds = titleChances({ ...model, played: timed.filter((x) => new Date(x.at).toISOString() <= at).map((x) => x.r) });
    if (!odds) continue;
    const next = Object.fromEntries(odds.players.map((p) => [p.key, Number(p.title.toFixed(4))]));
    if (!oddsChanged(prev, next)) continue;
    rows.push({ tournament_id: t.id, taken_at: at, odds: next });
    prev = next;
  }
  const { error } = await db.from("title_odds_snapshots").upsert(rows, { onConflict: "tournament_id,taken_at" });
  console.log(t.name, error ? `error: ${error.message}` : `${rows.length} snapshots`);
}
