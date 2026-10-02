import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { winnerScore } from "@/lib/push/message";
import type { SetScore } from "@/lib/provider/types";
import { RECAP_SYSTEM, recapPrompt, type RecapFacts } from "@/lib/recap-prompt";
import type { AdminClient } from "@/lib/supabase/admin";

const MODEL = "claude-haiku-4-5-20251001";
const PER_RUN = 3;
const day = 24 * 60 * 60 * 1000;

/** Recaps run only with an API key, an explicit switch, and under a daily cap. */
export function recapsEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY) && process.env.RECAPS_ENABLED === "1";
}

const titleCase = (name: string) => (name === name.toUpperCase() ? name.toLowerCase().replace(/(^|[\s'(-])\p{L}/gu, (c) => c.toUpperCase()) : name);

/** Writes recaps for recent finals and semifinals that don't have one yet. */
export async function generateRecaps(db: AdminClient, now = new Date()): Promise<{ status: "off" } | { status: "ok"; written: number }> {
  if (!recapsEnabled()) return { status: "off" };
  const limit = Number(process.env.RECAPS_DAILY_LIMIT ?? 10);
  const { count } = await db.from("match_recaps").select("match_id", { count: "exact", head: true }).gte("created_at", new Date(now.getTime() - day).toISOString());
  const budget = Math.min(PER_RUN, Math.max(0, limit - (count ?? 0)));
  if (budget === 0) return { status: "ok", written: 0 };

  const { data: candidates, error } = await db
    .from("matches")
    .select(
      "id, round, winner_side, result_detail, set_scores, pre_match_p1, player1_id, player2_id, player1_name, player2_name, tournaments!inner(name, category, surface, end_date), p1:players!matches_player1_id_fkey(full_name), p2:players!matches_player2_id_fkey(full_name), match_recaps(match_id)",
    )
    .eq("status", "final")
    .eq("confirmed", true)
    .not("winner_side", "is", null)
    .in("round", ["Final", "Semifinals"])
    .gte("tournaments.end_date", new Date(now.getTime() - 3 * day).toISOString().slice(0, 10))
    .limit(50);
  if (error) throw new Error(`recap candidates: ${error.message}`);
  // One-to-one embed: an object (or an array, depending on the relation's shape) when a recap exists.
  const hasRecap = (r: unknown) => (Array.isArray(r) ? r.length > 0 : r != null);
  const todo = (candidates ?? []).filter((m) => !hasRecap(m.match_recaps) && m.result_detail !== "walkover").slice(0, budget);
  if (todo.length === 0) return { status: "ok", written: 0 };

  const client = new Anthropic();
  let written = 0;
  for (const m of todo) {
    const w = m.winner_side as 1 | 2;
    const name1 = m.p1?.full_name ?? m.player1_name ?? "Player 1";
    const name2 = m.p2?.full_name ?? m.player2_name ?? "Player 2";
    let h2h: RecapFacts["h2h"] = null;
    if (m.player1_id !== null && m.player2_id !== null) {
      const { data: meetings } = await db
        .from("matches")
        .select("winner_side, player1_id")
        .eq("status", "final")
        .eq("confirmed", true)
        .neq("id", m.id)
        .or(`and(player1_id.eq.${m.player1_id},player2_id.eq.${m.player2_id}),and(player1_id.eq.${m.player2_id},player2_id.eq.${m.player1_id})`);
      const winnerId = w === 1 ? m.player1_id : m.player2_id;
      const wins = (meetings ?? []).filter((x) => (x.winner_side === 1 ? x.player1_id : x.player1_id === m.player1_id ? m.player2_id : m.player1_id) === winnerId).length;
      h2h = { winner: wins, loser: (meetings ?? []).length - wins };
    }
    const facts: RecapFacts = {
      tournament: titleCase(m.tournaments.name),
      category: m.tournaments.category,
      surface: m.tournaments.surface,
      round: m.round ?? "Final",
      winner: w === 1 ? name1 : name2,
      loser: w === 1 ? name2 : name1,
      score: winnerScore((Array.isArray(m.set_scores) ? m.set_scores : []) as unknown as SetScore[], w),
      retired: m.result_detail === "retired",
      winnerChance: m.pre_match_p1 === null ? null : w === 1 ? m.pre_match_p1 : 1 - m.pre_match_p1,
      h2h,
    };
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 400,
      system: RECAP_SYSTEM,
      messages: [{ role: "user", content: recapPrompt(facts) }],
    });
    const body = res.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("")
      .trim();
    if (!body) continue;
    const { error: insErr } = await db.from("match_recaps").upsert({ match_id: m.id, body: body.slice(0, 2000), model: MODEL });
    if (insErr) throw new Error(`save recap: ${insErr.message}`);
    written++;
  }
  return { status: "ok", written };
}
