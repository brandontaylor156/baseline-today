import "server-only";

import webpush from "web-push";

import type { SetScore } from "@/lib/provider/types";
import type { AdminClient } from "@/lib/supabase/admin";

import { pushConfig } from "./config";
import { resultMessage, type NotifyMatch } from "./message";

/** Results older than this are marked as told without a notification (e.g. a late backfill). */
const FRESH_HOURS = 24;
const BATCH = 200;

export interface NotifySummary {
  status: "ok" | "off" | "error";
  matches?: number;
  sent?: number;
  removed?: number;
  error?: string;
}

/**
 * Tells fans about results confirmed since the last run. Each result is claimed (notified_at set)
 * before sending, so overlapping runs never notify twice; a failed send is not retried.
 */
export async function notifyFavorites(db: AdminClient, now = new Date()): Promise<NotifySummary> {
  const config = pushConfig();
  if (!config) return { status: "off" };
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  try {
    const fresh = new Date(now.getTime() - FRESH_HOURS * 3600 * 1000).toISOString();
    // Stale ones: mark without sending.
    const { error: staleErr } = await db
      .from("matches")
      .update({ notified_at: now.toISOString() })
      .is("notified_at", null)
      .eq("status", "final")
      .eq("confirmed", true)
      .or(`score_changed_at.is.null,score_changed_at.lt.${fresh}`);
    if (staleErr) throw new Error(`mark stale: ${staleErr.message}`);

    const { data: due, error: dErr } = await db
      .from("matches")
      .select("id")
      .is("notified_at", null)
      .eq("status", "final")
      .eq("confirmed", true)
      .gte("score_changed_at", fresh)
      .order("score_changed_at")
      .limit(BATCH);
    if (dErr) throw new Error(`find results: ${dErr.message}`);
    if (!due?.length) return { status: "ok", matches: 0, sent: 0, removed: 0 };

    // The claim: only rows still unclaimed come back.
    const { data: claimed, error } = await db
      .from("matches")
      .update({ notified_at: now.toISOString() })
      .in("id", due.map((m) => m.id))
      .is("notified_at", null)
      .select("id, round, result_detail, set_scores, winner_side, player1_id, player2_id, player1_name, player2_name, tournaments!inner(name), p1:players!matches_player1_id_fkey(full_name), p2:players!matches_player2_id_fkey(full_name)");
    if (error) throw new Error(`claim results: ${error.message}`);
    const matches: NotifyMatch[] = (claimed ?? [])
      .filter((m) => m.winner_side === 1 || m.winner_side === 2)
      .map((m) => ({
        id: m.id,
        round: m.round,
        resultDetail: m.result_detail,
        sets: (Array.isArray(m.set_scores) ? m.set_scores : []) as unknown as SetScore[],
        winner: m.winner_side as 1 | 2,
        tournament: m.tournaments.name,
        p1: { id: m.player1_id, name: m.p1?.full_name ?? m.player1_name ?? "?" },
        p2: { id: m.player2_id, name: m.p2?.full_name ?? m.player2_name ?? "?" },
      }));
    const playerIds = [...new Set(matches.flatMap((m) => [m.p1.id, m.p2.id]).filter((id): id is number => id !== null))];
    if (playerIds.length === 0) return { status: "ok", matches: matches.length, sent: 0, removed: 0 };

    const { data: fans, error: fErr } = await db.from("favorites").select("user_id, player_id").in("player_id", playerIds);
    if (fErr) throw new Error(`favorites: ${fErr.message}`);
    const userIds = [...new Set((fans ?? []).map((f) => f.user_id))];
    if (userIds.length === 0) return { status: "ok", matches: matches.length, sent: 0, removed: 0 };

    const { data: subs, error: sErr } = await db.from("push_subscriptions").select("id, user_id, endpoint, p256dh, auth").in("user_id", userIds);
    if (sErr) throw new Error(`subscriptions: ${sErr.message}`);

    let sent = 0;
    const gone: number[] = [];
    for (const m of matches) {
      // One message per user per match, about the player they follow.
      const told = new Set<string>();
      for (const f of fans ?? []) {
        if ((f.player_id !== m.p1.id && f.player_id !== m.p2.id) || told.has(f.user_id)) continue;
        const winnerId = m.winner === 1 ? m.p1.id : m.p2.id;
        const followsWinner = (fans ?? []).some((x) => x.user_id === f.user_id && x.player_id === winnerId);
        told.add(f.user_id);
        const payload = JSON.stringify(resultMessage(m, followsWinner && winnerId !== null ? winnerId : f.player_id));
        for (const s of subs ?? []) {
          if (s.user_id !== f.user_id || gone.includes(s.id)) continue;
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 6 * 3600, urgency: "normal" });
            sent++;
          } catch (err) {
            const code = (err as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) gone.push(s.id); // unsubscribed in the browser
          }
        }
      }
    }
    if (gone.length) await db.from("push_subscriptions").delete().in("id", gone);
    return { status: "ok", matches: matches.length, sent, removed: gone.length };
  } catch (err) {
    return { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}
