"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Flag } from "@/components/flag";
import { liveChance, stateFromScore } from "@/lib/live-prob";
import { callTable, momentum, openCalls, roomModel, type Call } from "@/lib/party";
import { replay } from "@/lib/scorekeeper";
import type { Database } from "@/lib/supabase/database.types";

import { loadClient, signInWithGoogle, useUser } from "../use-user";
import { MomentumChart } from "./momentum-chart";

type Db = SupabaseClient<Database>;
type PartyState = { points: (1 | 2)[]; firstServerA: boolean; bestOf: 3 | 5 };
type Party = { id: string; code: string; match_id: number; host_id: string; state: PartyState; ends_at: string };
type Member = { user_id: string; nickname: string };
type ChatLine = { id: string; uid: string; nick: string; text: string; at: number };
type MatchInfo = {
  id: number;
  tour: "atp" | "wta";
  tournament: string;
  tournamentId: number;
  round: string | null;
  bestOf: 3 | 5;
  a: { id: number | null; name: string; countryCode: string | null; rank: number | null };
  b: { id: number | null; name: string; countryCode: string | null; rank: number | null };
  chanceA: number | null;
  status: string;
  winner: number | null;
  live: { sets: { p1: number | null; p2: number | null }[]; gameA: string | null; gameB: string | null; serverA: boolean | null } | null;
};

const REACTIONS = ["🎾", "🔥", "😱", "👏", "😬", "🙌"];
const ONLINE_MS = 45_000;
const pct = (p: number) => `${Math.round(p * 100)}%`;
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
        to join this watch party.
      </p>
    );
  }
  if (party === "gone") return <p className="rounded-xl border border-border bg-surface p-4 text-sm">This party has ended or you’re no longer in it.</p>;
  if (party === "join") return <JoinForm code={code} onJoined={() => db && loadParty(db)} />;
  if (!party || !match || !snap || !state) return <p className="text-sm text-muted">Loading the party…</p>;

  const scoring = !match.live && isHost && !snap.winner;
  const openKeys = match.live ? [] : openCalls(snap);
  const table = callTable(calls, snap);
  const nick = (u: string) => members.find((m) => m.user_id === u)?.nickname ?? "Someone";
  const isOnline = (u: string) => now - (online.get(u) ?? 0) < ONLINE_MS;
  const sets = match.live ? match.live.sets.filter((s) => s.p1 !== null).map((s) => ({ a: s.p1!, b: s.p2! })) : snap.sets;
  const game = match.live ? [match.live.gameA ?? "", match.live.gameB ?? ""] : [snap.gameA, snap.gameB];
  const serverA = match.live ? match.live.serverA : snap.serverA;
  const invite = typeof window === "undefined" ? "" : `${window.location.origin}/party/${party.code}`;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-accent">Watch party</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {match.a.name} vs {match.b.name}
          </h1>
          <p className="text-sm text-muted">
            <Link href={`/tournaments/${match.tournamentId}`} className="hover:underline">
              {match.tournament}
            </Link>
            {match.round ? ` · ${match.round}` : ""} · {[...members].filter((m) => isOnline(m.user_id)).length} watching
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
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
        </div>
      </header>
      {notice && (
        <p role="status" className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm">
          {notice}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-5">
          <section aria-label="Score" className="relative rounded-xl border border-border bg-surface p-4">
            {[1, 2].map((side) => {
              const p = side === 1 ? match.a : match.b;
              const serving = serverA !== null && serverA === (side === 1);
              return (
                <div key={side} className="flex items-center gap-2 py-1">
                  <Flag code={p.countryCode} reserve />
                  <span className={`min-w-0 flex-1 truncate font-medium ${snap.winner === side ? "text-accent" : ""}`}>{p.name}</span>
                  {serving && !snap.winner && <span className="size-2 rounded-full bg-accent" title="Serving" />}
                  {sets.map((s, i) => (
                    <span key={i} className="w-5 text-center font-mono tabular-nums">
                      {side === 1 ? s.a : s.b}
                    </span>
                  ))}
                  {!snap.winner && <span className="w-9 rounded bg-accent-soft text-center font-mono text-sm text-accent tabular-nums">{game[side - 1]}</span>}
                </div>
              );
            })}
            {chanceA !== null && (
              <div className="mt-3">
                <div className="flex justify-between text-sm font-semibold tabular-nums">
                  <span>{pct(chanceA)}</span>
                  <span className="text-xs font-normal text-muted">chance to win</span>
                  <span>{pct(1 - chanceA)}</span>
                </div>
                <div aria-hidden className="mt-1 flex h-2 overflow-hidden rounded-full bg-surface-muted">
                  <span className="bg-chart-line transition-all duration-500" style={{ width: `${chanceA * 100}%` }} />
                </div>
              </div>
            )}
            {/* Reactions float over the scoreboard for a few seconds. */}
            <div aria-live="polite" className="pointer-events-none absolute right-3 top-2 flex flex-col items-end gap-1">
              {bursts.map((b) => (
                <span key={b.id} className="animate-bounce text-xl" title={b.nick}>
                  {b.emoji}
                  <span className="sr-only"> from {b.nick}</span>
                </span>
              ))}
            </div>
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
          </section>

          {line.length >= 2 && (
            <section aria-label="Momentum" className="rounded-xl border border-border bg-surface p-4">
              <MomentumChart line={line} nameA={match.a.name} nameB={match.b.name} />
            </section>
          )}

          <section aria-labelledby="calls-heading" className="rounded-xl border border-border bg-surface p-4">
            <h2 id="calls-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Call it
            </h2>
            {openKeys.length === 0 ? (
              <p className="text-sm text-muted">{snap.winner ? "Match over." : "Calls open before each set."}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {openKeys.map((key) => {
                  const mine = calls.find((c) => c.user_id === user.id && c.call_key === key)?.side;
                  return (
                    <li key={key}>
                      <p className="mb-1 text-xs text-muted">{key === "match" ? "Who wins the match?" : `Who wins set ${key.slice(4)}?`}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {([1, 2] as const).map((side) => (
                          <button
                            key={side}
                            type="button"
                            aria-pressed={mine === side}
                            onClick={() => call(key, side)}
                            className={`truncate rounded-lg border px-3 py-1.5 ${mine === side ? "border-accent bg-accent-soft font-medium" : "border-border hover:bg-surface-muted"}`}
                          >
                            {side === 1 ? match.a.name : match.b.name}
                          </button>
                        ))}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {table.size > 0 && (
              <ol className="mt-3 space-y-1 border-t border-border pt-2 text-sm">
                {[...table.entries()]
                  .sort((x, y) => y[1].right - x[1].right || x[1].settled - y[1].settled)
                  .map(([u, r], i) => (
                    <li key={u} className="flex gap-2">
                      <span className="w-4 text-right text-xs text-muted">{i + 1}</span>
                      <span className="flex-1 truncate">{nick(u)}</span>
                      <span className="tabular-nums">
                        {r.right}/{r.settled}
                      </span>
                    </li>
                  ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="space-y-4">
          <Chat lines={chat} me={user.id} onSend={sendChat} onReact={react} />
          <section aria-labelledby="who-heading" className="rounded-xl border border-border bg-surface p-4">
            <h2 id="who-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              In the room
            </h2>
            <ul className="space-y-1 text-sm">
              {members.map((m) => (
                <li key={m.user_id} className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${isOnline(m.user_id) ? "bg-accent" : "bg-surface-muted"}`} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {m.nickname}
                    {m.user_id === party.host_id ? <span className="text-xs text-muted"> (host)</span> : null}
                    <span className="sr-only">{isOnline(m.user_id) ? ", here now" : ", away"}</span>
                  </span>
                  {isHost && m.user_id !== user.id && (
                    <button type="button" onClick={() => remove(m)} className="text-xs text-muted hover:text-foreground hover:underline">
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
      <p className="text-xs text-muted">
        Chat and reactions aren’t stored: they go only to people in the room right now. Win chances are our model’s estimates, not
        betting advice. The party closes 12 hours after it starts.
      </p>
    </div>
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

function Chat({ lines, me, onSend, onReact }: { lines: ChatLine[]; me: string; onSend: (t: string) => void; onReact: (e: string) => void }) {
  const [text, setText] = useState("");
  const box = useRef<HTMLOListElement>(null);
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight });
  }, [lines.length]);
  return (
    <section aria-labelledby="chat-heading" className="flex h-96 flex-col rounded-xl border border-border bg-surface">
      <h2 id="chat-heading" className="border-b border-border px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted">
        Chat
      </h2>
      <ol ref={box} aria-live="polite" className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-4 py-2 text-sm">
        {lines.length === 0 && <li className="text-muted">Say hi. Messages vanish when you leave.</li>}
        {lines.map((l) => (
          <li key={l.id} className="break-words">
            <span className={`font-medium ${l.uid === me ? "text-accent" : ""}`}>{l.nick}</span> {l.text}
          </li>
        ))}
      </ol>
      <div className="flex gap-1 border-t border-border px-3 pt-2">
        {REACTIONS.map((e) => (
          <button key={e} type="button" onClick={() => onReact(e)} className="rounded-md px-1.5 py-0.5 text-lg hover:bg-surface-muted" aria-label={`React ${e}`}>
            {e}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSend(text);
          setText("");
        }}
        className="flex gap-2 p-3"
      >
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="Message" aria-label="Message" className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm" />
        <button type="submit" className="rounded-lg border border-accent bg-accent px-3 py-1.5 text-sm font-medium text-background">
          Send
        </button>
      </form>
    </section>
  );
}
