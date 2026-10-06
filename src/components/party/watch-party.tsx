"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { liveChance, stateFromScore } from "@/lib/live-prob";
import { callTable, momentum, openCalls, roomModel, type Call } from "@/lib/party";
import { replay } from "@/lib/scorekeeper";
import type { Database } from "@/lib/supabase/database.types";

import { loadClient, signInWithGoogle, useUser } from "../use-user";
import { callRows, PartyRoom, type ChatLine, type MatchInfo, type Scoreboard } from "./party-room";

type Db = SupabaseClient<Database>;
type PartyState = { points: (1 | 2)[]; firstServerA: boolean; bestOf: 3 | 5 };
type Party = { id: string; code: string; match_id: number; host_id: string; state: PartyState; ends_at: string };
type Member = { user_id: string; nickname: string };

const ONLINE_MS = 45_000;
const uid = () => Math.random().toString(36).slice(2, 10);
/** Wall clock, for event handlers and timers (never read during render). */
const clock = () => Date.now();

/** A private watch party: live score (or host scorekeeping), win chance, calls, chat, reactions. */
export function WatchParty({ code }: { code: string }) {
  const user = useUser();
  const pathname = usePathname();
  const [db, setDb] = useState<Db | null>(null);
  const [party, setParty] = useState<Party | null | "join" | "gone">(null);
  const [match, setMatch] = useState<MatchInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [bursts, setBursts] = useState<{ id: string; emoji: string; nick: string }[]>([]);
  const [online, setOnline] = useState<Map<string, number>>(new Map());
  const [liveLine, setLiveLine] = useState<number[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  // "Who's here" compares heartbeats with this clock, which ticks every 10 seconds.
  const [now, setNow] = useState(clock);
  useEffect(() => {
    const t = setInterval(() => setNow(clock()), 10_000);
    return () => clearInterval(t);
  }, []);
  const channel = useRef<RealtimeChannel | null>(null);

  const me = user ? members.find((m) => m.user_id === user.id) : undefined;
  const isHost = Boolean(user && party && typeof party === "object" && party.host_id === user.id);

  // Load the party (RLS: visible only to members).
  const loadParty = useCallback(async (client: Db) => {
    const { data } = await client.from("parties").select("id, code, match_id, host_id, state, ends_at").eq("code", code.toUpperCase()).maybeSingle();
    if (!data) return setParty("join");
    const p = data as unknown as Party;
    setParty({ ...p, state: { points: p.state.points ?? [], firstServerA: p.state.firstServerA ?? true, bestOf: p.state.bestOf ?? 3 } });
    const [{ data: mem }, { data: c }] = await Promise.all([
      client.from("party_members").select("user_id, nickname").eq("party_id", p.id).order("joined_at"),
      client.from("party_calls").select("user_id, call_key, side").eq("party_id", p.id),
    ]);
    setMembers(mem ?? []);
    setCalls(c ?? []);
  }, [code]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const client = (await loadClient()) as Db;
      if (cancelled) return;
      setDb(client);
      await loadParty(client);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loadParty]);

  const partyId = party && typeof party === "object" ? party.id : null;
  const matchId = party && typeof party === "object" ? party.match_id : null;

  // Match facts, refreshed while it may be live.
  useEffect(() => {
    if (!matchId) return;
    let stop = false;
    const load = async () => {
      const res = await fetch(`/api/matches/${matchId}`);
      if (!stop && res.ok) setMatch((await res.json()) as MatchInfo);
    };
    void load();
    const t = setInterval(load, 20_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [matchId]);

  // Realtime: chat, reactions, score, calls, who's here (private channel, members only).
  useEffect(() => {
    if (!db || !partyId || !user) return;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const ch = db.channel(`party:${partyId}`, { config: { private: true } });
    channel.current = ch;
    const seen = (u: string) => setOnline((prev) => new Map(prev).set(u, clock()));
    ch.on("broadcast", { event: "chat" }, ({ payload }) => {
      const line = payload as ChatLine;
      seen(line.uid);
      setChat((prev) => [...prev, line].slice(-150));
    })
      .on("broadcast", { event: "react" }, ({ payload }) => {
        const r = payload as { id: string; emoji: string; nick: string };
        setBursts((prev) => [...prev, r].slice(-12));
        setTimeout(() => setBursts((prev) => prev.filter((x) => x.id !== r.id)), 3500);
      })
      .on("broadcast", { event: "here" }, ({ payload }) => seen((payload as { uid: string }).uid))
      .on("broadcast", { event: "score" }, ({ payload }) => setParty((prev) => (prev && typeof prev === "object" ? { ...prev, state: payload as PartyState } : prev)))
      .on("broadcast", { event: "refresh" }, () => void loadParty(db))
      .on("broadcast", { event: "kick" }, ({ payload }) => {
        if ((payload as { uid: string }).uid === user.id) {
          setParty("gone");
          void db.removeChannel(ch);
        } else void loadParty(db);
      })
      .on("broadcast", { event: "ended" }, () => {
        setParty("gone");
        void db.removeChannel(ch);
      });
    (async () => {
      await db.realtime.setAuth();
      ch.subscribe((status) => {
        if (status !== "SUBSCRIBED") return;
        const ping = () => void ch.send({ type: "broadcast", event: "here", payload: { uid: user.id } });
        ping();
        heartbeat = setInterval(ping, 15_000);
        seen(user.id);
      });
    })();
    return () => {
      if (heartbeat) clearInterval(heartbeat);
      void db.removeChannel(ch);
      channel.current = null;
    };
  }, [db, partyId, user, loadParty]);

  const send = (event: string, payload: object) => void channel.current?.send({ type: "broadcast", event, payload });

  // Score: live data when the provider has it, otherwise the host's point log.
  const state = party && typeof party === "object" ? party.state : null;
  const model = useMemo(() => (match ? roomModel(match.chanceA, match.bestOf, match.tour) : null), [match]);
  const snap = useMemo(() => (state ? replay(state.points, state.bestOf, state.firstServerA) : null), [state]);
  const liveState = match?.live ? stateFromScore(match.live.sets, match.live.gameA, match.live.gameB, match.live.serverA) : null;
  const chanceA = model && (liveState ? liveChance(model, liveState) : snap ? (snap.winner ? (snap.winner === 1 ? 1 : 0) : liveChance(model, snap.state)) : null);
  const line = useMemo(() => (model && state && !match?.live ? momentum(state.points, model, state.firstServerA) : liveLine), [model, state, match?.live, liveLine]);

  // With live data, the line grows as the score changes.
  const lastLive = useRef<number | null>(null);
  useEffect(() => {
    if (!match?.live || chanceA === null || chanceA === lastLive.current) return;
    lastLive.current = chanceA;
    queueMicrotask(() => setLiveLine((prev) => [...prev, chanceA]));
  }, [match?.live, chanceA]);

  async function keepScore(points: (1 | 2)[], firstServerA = state!.firstServerA) {
    if (!db || !partyId || !state) return;
    const next = { ...state, points, firstServerA };
    setParty((prev) => (prev && typeof prev === "object" ? { ...prev, state: next } : prev));
    send("score", next);
    const { error } = await db.from("parties").update({ state: next }).eq("id", partyId);
    if (error) setNotice("Couldn’t save the score. Check your connection.");
  }

  async function call(key: string, side: 1 | 2) {
    if (!db || !partyId || !user) return;
    const mine = calls.find((c) => c.user_id === user.id && c.call_key === key);
    const { error } = mine
      ? await db.from("party_calls").update({ side, called_at: new Date().toISOString() }).eq("party_id", partyId).eq("call_key", key)
      : await db.from("party_calls").insert({ party_id: partyId, call_key: key, side });
    if (error) return setNotice("Couldn’t save your call.");
    setCalls((prev) => [...prev.filter((c) => !(c.user_id === user.id && c.call_key === key)), { user_id: user.id, call_key: key, side }]);
    send("refresh", {});
  }

  const lastChat = useRef(0);
  function sendChat(text: string) {
    const t = text.trim().slice(0, 200);
    const at = clock();
    if (!t || !user || !me || at - lastChat.current < 1000) return;
    lastChat.current = at;
    const line: ChatLine = { id: uid(), uid: user.id, nick: me.nickname, text: t, at };
    setChat((prev) => [...prev, line].slice(-150));
    send("chat", line);
  }

  function react(emoji: string) {
    if (!me) return;
    const r = { id: uid(), emoji, nick: me.nickname };
    setBursts((prev) => [...prev, r].slice(-12));
    setTimeout(() => setBursts((prev) => prev.filter((x) => x.id !== r.id)), 3500);
    send("react", r);
  }

  async function remove(m: Member) {
    if (!db || !partyId || !window.confirm(`Remove ${m.nickname} from the party?`)) return;
    await db.from("party_members").delete().eq("party_id", partyId).eq("user_id", m.user_id);
    send("kick", { uid: m.user_id });
    void loadParty(db);
  }

  async function end() {
    if (!db || !partyId || !window.confirm("End the party for everyone?")) return;
    send("ended", {});
    await db.from("parties").delete().eq("id", partyId);
    setParty("gone");
  }

  // ---- States before the room ----
  if (user === undefined) return null;
  if (!user) {
    return (
      <p className="rounded-xl border border-border bg-surface p-4 text-sm">
        <button type="button" onClick={() => signInWithGoogle(pathname)} className="font-medium text-accent hover:underline">
          Sign in with Google
        </button>{" "}
        to join this watch party, or{" "}
        <Link href="/party/demo" className="font-medium text-accent hover:underline">
          see how watch parties work
        </Link>
        .
      </p>
    );
  }
  if (party === "gone") return <p className="rounded-xl border border-border bg-surface p-4 text-sm">This party has ended or you’re no longer in it.</p>;
  if (party === "join") return <JoinForm code={code} onJoined={() => db && loadParty(db)} />;
  if (!party || !match || !snap || !state) return <p className="text-sm text-muted">Loading the party…</p>;

  const scoring = !match.live && isHost && !snap.winner;
  const openKeys = match.live ? [] : openCalls(snap);
  const nick = (u: string) => members.find((m) => m.user_id === u)?.nickname ?? "Someone";
  const isOnline = (u: string) => now - (online.get(u) ?? 0) < ONLINE_MS;
  const invite = typeof window === "undefined" ? "" : `${window.location.origin}/party/${party.code}`;
  const score: Scoreboard = {
    sets: match.live ? match.live.sets.filter((s) => s.p1 !== null).map((s) => ({ a: s.p1!, b: s.p2! })) : snap.sets,
    game: match.live ? [match.live.gameA ?? "", match.live.gameB ?? ""] : [snap.gameA, snap.gameB],
    serverA: match.live ? match.live.serverA : snap.serverA,
    winner: snap.winner,
    chanceA,
    line,
  };

  return (
    <PartyRoom
      match={match}
      score={score}
      notice={notice}
      actions={
        <>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(invite);
              setNotice("Invite link copied.");
            }}
            className="rounded-lg border border-accent bg-accent px-3 py-1.5 font-medium text-background"
          >
            Copy invite link
          </button>
          {isHost && (
            <button type="button" onClick={end} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-muted">
              End party
            </button>
          )}
        </>
      }
      scoreControls={
        <>
          {scoring && (
            <div className="mt-4 space-y-2 border-t border-border pt-3">
              <p className="text-xs text-muted">You’re keeping score: tap who won each point.</p>
              <div className="grid grid-cols-2 gap-2">
                {([1, 2] as const).map((side) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => keepScore([...state.points, side])}
                    className="truncate rounded-lg border border-accent bg-accent px-3 py-2 text-sm font-medium text-background"
                  >
                    Point {side === 1 ? match.a.name.split(" ").at(-1) : match.b.name.split(" ").at(-1)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <button type="button" disabled={state.points.length === 0} onClick={() => keepScore(state.points.slice(0, -1))} className="rounded-md border border-border px-2 py-1 disabled:opacity-50">
                  Undo point
                </button>
                {state.points.length === 0 && (
                  <button type="button" onClick={() => keepScore([], !state.firstServerA)} className="rounded-md border border-border px-2 py-1">
                    First serve: {state.firstServerA ? match.a.name : match.b.name} (switch)
                  </button>
                )}
              </div>
            </div>
          )}
          {!match.live && !isHost && state.points.length === 0 && <p className="mt-3 text-xs text-muted">The host keeps score here until live scores are available.</p>}
        </>
      }
      bursts={bursts}
      openKeys={openKeys}
      myCall={(key) => calls.find((c) => c.user_id === user.id && c.call_key === key)?.side}
      onCall={call}
      callRows={callRows(callTable(calls, snap), nick)}
      chat={chat}
      meId={user.id}
      onSend={sendChat}
      onReact={react}
      members={members.map((m) => ({ id: m.user_id, nickname: m.nickname, host: m.user_id === party.host_id, online: isOnline(m.user_id) }))}
      onRemove={isHost ? (id) => void remove(members.find((m) => m.user_id === id)!) : undefined}
      footnote="Chat and reactions aren’t stored: they go only to people in the room right now. Win chances are our model’s estimates, not betting advice. The party closes 12 hours after it starts."
    />
  );
}

function JoinForm({ code, onJoined }: { code: string; onJoined: () => void }) {
  const [nick, setNick] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function join(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = await loadClient();
    const { error } = await supabase.rpc("join_party", { p_code: code, p_nickname: nick.trim() });
    if (error) {
      setError(/no live party/i.test(error.message) ? "This party has ended or the link is wrong." : /full/i.test(error.message) ? "This party is full." : "That nickname is taken here or not allowed.");
      return;
    }
    onJoined();
  }
  return (
    <form onSubmit={join} className="max-w-md space-y-3 rounded-xl border border-border bg-surface p-4 text-sm">
      <h1 className="text-lg font-semibold">Join the watch party</h1>
      <label className="block">
        <span className="text-xs text-muted">Your nickname in the room</span>
        <input value={nick} onChange={(e) => setNick(e.target.value)} required maxLength={24} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5" />
      </label>
      <button type="submit" className="rounded-lg border border-accent bg-accent px-3 py-1.5 font-medium text-background">
        Join
      </button>
      {error && (
        <p role="alert" className="text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}
