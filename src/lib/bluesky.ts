import "server-only";

import { clip300, facets } from "@/lib/bluesky-text";
import { getWeekRecap } from "@/lib/data/weekly";
import { displayName } from "@/lib/data/tournaments";
import { SITE_URL } from "@/lib/site";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { mondayOf, shiftWeek, weekLabel } from "@/lib/weeks";

type AdminClient = ReturnType<typeof createAdminClient>;
const PDS = "https://bsky.social/xrpc";
const STATE_KEY = "bluesky";
const pct = (p: number) => `${Math.round(p * 100)}%`;

/** Off until BLUESKY_HANDLE and BLUESKY_APP_PASSWORD (an app password, not the account password) are set. */
export function blueskyEnabled(): boolean {
  return Boolean(process.env.BLUESKY_HANDLE && process.env.BLUESKY_APP_PASSWORD);
}

type Session = { accessJwt: string; did: string };

async function xrpc<T>(method: string, body: BodyInit, session?: Session, contentType = "application/json"): Promise<T> {
  const res = await fetch(`${PDS}/${method}`, {
    method: "POST",
    headers: { "Content-Type": contentType, ...(session ? { Authorization: `Bearer ${session.accessJwt}` } : {}) },
    body,
  });
  if (!res.ok) throw new Error(`${method}: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T;
}

/** Profile text: the account says plainly that it's automated, who runs it, and what it posts. */
export const BOT_DISPLAY_NAME = "Baseline Today (bot)";
export const BOT_DESCRIPTION =
  "🤖 Automated account. Posts the day's biggest tennis upset and a weekly recap from baseline-today.vercel.app, generated from results on Wikipedia draw pages. Run by the site's developer; replies are read by a human.";

async function login(): Promise<Session> {
  return xrpc<Session>("com.atproto.server.createSession", JSON.stringify({ identifier: process.env.BLUESKY_HANDLE, password: process.env.BLUESKY_APP_PASSWORD }));
}

/** Uploads one of our own share images as the link card's thumbnail (best effort). */
async function thumb(session: Session, path: string): Promise<unknown | undefined> {
  const res = await fetch(`${SITE_URL}${path}`).catch(() => null);
  if (!res?.ok) return undefined;
  const type = res.headers.get("content-type") ?? "image/png";
  const data = await res.arrayBuffer();
  if (data.byteLength > 950_000) return undefined;
  const out = await xrpc<{ blob: unknown }>("com.atproto.repo.uploadBlob", data, session, type).catch(() => null);
  return out?.blob;
}

export interface BotPost {
  key: string;
  text: string;
  link: { path: string; title: string; description: string; image: string };
}

async function publish(session: Session, post: BotPost): Promise<{ uri: string; cid: string }> {
  const text = clip300(post.text);
  const image = await thumb(session, post.link.image);
  return xrpc<{ uri: string; cid: string }>(
    "com.atproto.repo.createRecord",
    JSON.stringify({
      repo: session.did,
      collection: "app.bsky.feed.post",
      record: {
        $type: "app.bsky.feed.post",
        text,
        facets: facets(text),
        createdAt: new Date().toISOString(),
        langs: ["en"],
        embed: {
          $type: "app.bsky.embed.external",
          external: { uri: `${SITE_URL}${post.link.path}`, title: post.link.title, description: post.link.description, ...(image ? { thumb: image } : {}) },
        },
      },
    }),
    session,
  );
}

type UpsetRow = {
  id: number;
  round: string | null;
  winner_side: number;
  pre_match_p1: number;
  tour: string;
  player1_name: string | null;
  player2_name: string | null;
  p1: { full_name: string } | null;
  p2: { full_name: string } | null;
  tournaments: { name: string };
};

/** Today's candidate posts: the biggest upset of the last day, and on Mondays last week's recap. */
export async function botPosts(db: AdminClient, now = new Date()): Promise<BotPost[]> {
  const posts: BotPost[] = [];
  const dayAgo = new Date(now.getTime() - 26 * 3_600_000).toISOString();
  const { data } = await db
    .from("matches")
    .select("id, round, winner_side, pre_match_p1, tour, player1_name, player2_name, p1:players!matches_player1_id_fkey(full_name), p2:players!matches_player2_id_fkey(full_name), tournaments!inner(name)")
    .eq("status", "final")
    .eq("confirmed", true)
    .neq("result_detail", "walkover")
    .not("pre_match_p1", "is", null)
    .in("winner_side", [1, 2])
    .gte("score_changed_at", dayAgo)
    .limit(1000);
  const upsets = ((data ?? []) as unknown as UpsetRow[])
    .map((m) => ({ m, chance: m.winner_side === 1 ? m.pre_match_p1 : 1 - m.pre_match_p1 }))
    .filter((u) => u.chance <= 0.3)
    .sort((a, b) => a.chance - b.chance);
  if (upsets[0]) {
    const { m, chance } = upsets[0];
    const n1 = m.p1?.full_name ?? m.player1_name ?? "Player 1";
    const n2 = m.p2?.full_name ?? m.player2_name ?? "Player 2";
    const [w, l] = m.winner_side === 1 ? [n1, n2] : [n2, n1];
    const where = `${displayName(m.tournaments.name)}${m.round ? `, ${m.round.toLowerCase()}` : ""}`;
    posts.push({
      key: `upset:${m.id}`,
      text: `Upset of the day: ${w} beat ${l} at ${where}. Our model gave ${w} a ${pct(chance)} chance before the match. #tennis #${m.tour.toUpperCase()}`,
      link: { path: `/matches/${m.id}`, title: `${w} vs ${l}`, description: `Result, pre-match chances and head-to-head · ${where}`, image: `/matches/${m.id}/opengraph-image` },
    });
  }

  if (now.getUTCDay() === 1) {
    const week = shiftWeek(mondayOf(now.toISOString().slice(0, 10)), -1);
    const recap = await getWeekRecap(week);
    if (recap) {
      const champs = recap.champions
        .map((c) => (c.tournament.champion ? `🏆 ${c.tournament.champion.name} (${displayName(c.tournament.name)})` : null))
        .filter(Boolean)
        .slice(0, 4)
        .join("\n");
      const model = recap.model.total ? `\nOur model: ${recap.model.correct}/${recap.model.total} (${pct(recap.model.correct / recap.model.total)})` : "";
      posts.push({
        key: `week:${week}`,
        text: `The tennis week, ${weekLabel(week)}:\n${champs}${model}\n#tennis`,
        link: { path: `/week/${week}`, title: `Week in tennis: ${weekLabel(week)}`, description: "Champions, biggest upsets, ranking movers and the model's record.", image: "/opengraph-image" },
      });
    }
  }
  return posts;
}

/**
 * Makes sure the profile is labelled as automated (keeps the avatar, banner and anything else set
 * in the app). Returns true if it had to update it.
 */
export async function ensureBotProfile(session: Session): Promise<boolean> {
  const res = await fetch(`${PDS}/com.atproto.repo.getRecord?repo=${encodeURIComponent(session.did)}&collection=app.bsky.actor.profile&rkey=self`, {
    headers: { Authorization: `Bearer ${session.accessJwt}` },
  });
  const current = res.ok ? (((await res.json()) as { value?: Record<string, unknown> }).value ?? {}) : {};
  if (current.displayName === BOT_DISPLAY_NAME && current.description === BOT_DESCRIPTION) return false;
  await xrpc(
    "com.atproto.repo.putRecord",
    JSON.stringify({
      repo: session.did,
      collection: "app.bsky.actor.profile",
      rkey: "self",
      record: { ...current, $type: "app.bsky.actor.profile", displayName: BOT_DISPLAY_NAME, description: BOT_DESCRIPTION },
    }),
    session,
  );
  return true;
}

export const BOT_INTRO =
  "Hi! I'm an automated account 🤖. I post the day's biggest tennis upset and a weekly recap of champions and ranking movers. A human reads the replies. The site is free and ad-free: title chances for every draw, head-to-heads since 2015, and a pick'em where you can try to beat the model. #tennis";

/** Posts the intro and pins it to the profile (run once at setup, only when asked). */
export async function postIntro(): Promise<string> {
  if (!blueskyEnabled()) return "off: set BLUESKY_HANDLE and BLUESKY_APP_PASSWORD";
  const session = await login();
  await ensureBotProfile(session);
  const ref = await publish(session, {
    key: "intro",
    text: BOT_INTRO,
    link: { path: "/", title: "Baseline Today", description: "Tennis rankings, results, title chances and head-to-heads.", image: "/opengraph-image" },
  });
  const res = await fetch(`${PDS}/com.atproto.repo.getRecord?repo=${encodeURIComponent(session.did)}&collection=app.bsky.actor.profile&rkey=self`, {
    headers: { Authorization: `Bearer ${session.accessJwt}` },
  });
  const current = res.ok ? (((await res.json()) as { value?: Record<string, unknown> }).value ?? {}) : {};
  await xrpc(
    "com.atproto.repo.putRecord",
    JSON.stringify({ repo: session.did, collection: "app.bsky.actor.profile", rkey: "self", record: { ...current, $type: "app.bsky.actor.profile", pinnedPost: ref } }),
    session,
  );
  return "intro posted and pinned";
}

/** Logs in and labels the profile; used at setup so the account is marked before its first post. */
export async function setUpBotProfile(): Promise<string> {
  if (!blueskyEnabled()) return "off: set BLUESKY_HANDLE and BLUESKY_APP_PASSWORD";
  return (await ensureBotProfile(await login())) ? "profile updated" : "profile already labelled";
}

/** Posts anything new (each post once, remembered in sync_state). Returns what happened. */
export async function runBluesky(db: AdminClient, now = new Date()): Promise<string> {
  if (!blueskyEnabled()) return "off";
  const { data: state } = await db.from("sync_state").select("details").eq("key", STATE_KEY).maybeSingle();
  const posted = new Set(((state?.details as { posted?: string[] } | null)?.posted ?? []).slice(-200));
  const fresh = (await botPosts(db, now)).filter((p) => !posted.has(p.key));
  if (fresh.length === 0) return "nothing new";
  const session = await login();
  // Never post from an account that doesn't say it's automated.
  await ensureBotProfile(session);
  for (const post of fresh) {
    await publish(session, post);
    posted.add(post.key);
  }
  await db.from("sync_state").upsert({ key: STATE_KEY, last_refreshed_at: now.toISOString(), status: "ok", details: { posted: [...posted] } as unknown as Json });
  return `posted ${fresh.length}`;
}
