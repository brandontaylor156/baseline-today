import "server-only";

import webpush from "web-push";

import type { AdminClient } from "@/lib/supabase/admin";

import { pushConfig } from "./config";
import { nextMatchMessage, type NextMatch } from "./message";
import type { NotifySummary } from "./notify";

/** Pairings older than this (or already started) are marked as told without a notification. */
const FRESH_HOURS = 36;
const BATCH = 200;

/**
 * Tells fans when their player's next match is set (a new scheduled pairing). Each match is claimed
 * (preview_notified_at) before sending, so it's announced at most once.
 */
export async function notifyNextMatches(db: AdminClient, now = new Date()): Promise<NotifySummary> {
  const config = pushConfig();
  if (!config) return { status: "off" };
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  try {
    const fresh = new Date(now.getTime() - FRESH_HOURS * 3600 * 1000).toISOString();
    // Old pairings, or ones whose start time has passed: mark without sending.
    const { error: staleErr } = await db
      .from("matches")
      .update({ preview_notified_at: now.toISOString() })
      .is("preview_notified_at", null)
      .eq("status", "scheduled")
      .or(`updated_at.lt.${fresh},scheduled_at.lt.${now.toISOString()}`);
    if (staleErr) throw new Error(`mark stale: ${staleErr.message}`);

    const { data: due, error: dErr } = await db.from("matches").select("id").is("preview_notified_at", null).eq("status", "scheduled").limit(BATCH);
    if (dErr) throw new Error(`find pairings: ${dErr.message}`);
    if (!due?.length) return { status: "ok", matches: 0, sent: 0, removed: 0 };

    const { data: claimed, error } = await db
      .from("matches")
      .update({ preview_notified_at: now.toISOString() })
      .in("id", due.map((m) => m.id))
      .is("preview_notified_at", null)
      .select("id, round, pre_match_p1, player1_id, player2_id, player1_name, player2_name, tournaments!inner(name), p1:players!matches_player1_id_fkey(full_name), p2:players!matches_player2_id_fkey(full_name)");
    if (error) throw new Error(`claim pairings: ${error.message}`);
    const matches: NextMatch[] = (claimed ?? []).map((m) => ({
      id: m.id,
      round: m.round,
      tournament: m.tournaments.name,
      chanceP1: m.pre_match_p1,
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
      const told = new Set<string>();
      for (const f of fans ?? []) {
        if ((f.player_id !== m.p1.id && f.player_id !== m.p2.id) || told.has(f.user_id)) continue;
        told.add(f.user_id);
        const payload = JSON.stringify(nextMatchMessage(m, f.player_id));
        for (const s of subs ?? []) {
          if (s.user_id !== f.user_id || gone.includes(s.id)) continue;
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 12 * 3600, urgency: "low" });
            sent++;
          } catch (err) {
            const code = (err as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) gone.push(s.id);
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
