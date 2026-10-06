"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { liveChance } from "@/lib/live-prob";
import { callTable, momentum, openCalls, roomModel, type Call } from "@/lib/party";
import { BOTS, botCall, botLine, eventAt, type Side } from "@/lib/party-demo";
import { replay } from "@/lib/scorekeeper";

import { callRows, PartyRoom, type Burst, type ChatLine, type MatchInfo } from "./party-room";

const ME = "you";
const SPEEDS = [
  { label: "1×", ms: 900 },
  { label: "3×", ms: 300 },
  { label: "10×", ms: 90 },
];
const lastName = (name: string) => name.split(" ").at(-1) ?? name;
const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * A watch party you can try without an account: a real finished match replayed point by point,
 * with three bots who chat, react and make calls. Nothing is sent or stored.
 */
export function DemoParty({ match, points, seed }: { match: MatchInfo; points: Side[]; seed: number }) {
  const [at, setAt] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [myCalls, setMyCalls] = useState<Call[]>([]);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [bursts, setBursts] = useState<Burst[]>([]);

  const model = useMemo(() => roomModel(match.chanceA, match.bestOf, match.tour), [match]);
  const fullLine = useMemo(() => momentum(points, model, true), [points, model]);
  const snap = useMemo(() => replay(points.slice(0, at), match.bestOf, true), [points, at, match.bestOf]);
  const names: [string, string] = [lastName(match.a.name), lastName(match.b.name)];

  // Bots call every key as it opens, before any points of that set are played.
  const botCalls = useMemo(() => {
    const out: Call[] = [];
    const seen = new Set<string>();
    for (let i = 0; i <= points.length; i++) {
      for (const key of openCalls(replay(points.slice(0, i), match.bestOf, true))) {
        if (seen.has(key)) continue;
        seen.add(key);
        BOTS.forEach((b, n) => out.push({ user_id: b.id, call_key: key, side: botCall(n, key, match.chanceA ?? 0.5, seed) }));
      }
    }
    return out;
  }, [points, match.bestOf, match.chanceA, seed]);
  const calls = useMemo(() => [...botCalls, ...myCalls], [botCalls, myCalls]);

  // Playback.
  useEffect(() => {
    if (!playing) return;
    if (at >= points.length) {
      queueMicrotask(() => setPlaying(false));
      return;
    }
    const t = setTimeout(() => setAt((i) => i + 1), SPEEDS[speed].ms);
    return () => clearTimeout(t);
  }, [playing, at, speed, points.length]);

  // Bots react to breaks, tiebreaks, sets and the result.
  const reacted = useRef(-1);
  const lastLine = useRef(-100);
  useEffect(() => {
    if (at <= reacted.current || (at === 0 && !playing)) return;
    reacted.current = at;
    const event = eventAt(points, at, match.bestOf);
    if (!event) return;
    // Breaks are common: comment on about half, and never right after another line.
    if (event.kind === "break" && (at % 2 === 1 || at - lastLine.current < 15)) return;
    lastLine.current = at;
    const said = botLine(event, names, at);
    if (!said) return;
    const bot = BOTS[said.bot];
    queueMicrotask(() => {
      setChat((prev) => [...prev, { id: uid(), uid: bot.id, nick: bot.nickname, text: said.text, at }].slice(-150));
      if (said.emoji) burst(said.emoji, bot.nickname);
    });
    // names is derived from match, which never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, at, points, match.bestOf]);

  function burst(emoji: string, nick: string) {
    const b = { id: uid(), emoji, nick };
    setBursts((prev) => [...prev, b].slice(-12));
    setTimeout(() => setBursts((prev) => prev.filter((x) => x.id !== b.id)), 3500);
  }

  function sendChat(text: string) {
    const t = text.trim().slice(0, 200);
    if (!t) return;
    const line: ChatLine = { id: uid(), uid: ME, nick: "You", text: t, at };
    setChat((prev) => [...prev, line].slice(-150));
    // One friendly reply, so the room feels alive.
    const chance = snap.winner ? null : liveChance(model, snap.state);
    const reply =
      chance === null
        ? "Good match, that"
        : `Model has ${chance >= 0.5 ? names[0] : names[1]} at ${Math.round(Math.max(chance, 1 - chance) * 100)}% right now`;
    setTimeout(() => setChat((prev) => [...prev, { id: uid(), uid: BOTS[2].id, nick: BOTS[2].nickname, text: reply, at }].slice(-150)), 1200);
  }

  function call(key: string, side: 1 | 2) {
    setMyCalls((prev) => [...prev.filter((c) => c.call_key !== key), { user_id: ME, call_key: key, side }]);
  }

  function restart() {
    setAt(0);
    setMyCalls([]);
    setChat([]);
    reacted.current = -1;
    lastLine.current = -100;
    setPlaying(true);
  }

  const nick = (id: string) => (id === ME ? "You" : (BOTS.find((b) => b.id === id)?.nickname ?? "Someone"));
  const over = at >= points.length;

  return (
    <PartyRoom
      match={match}
      score={{
        sets: snap.sets,
        game: [snap.gameA, snap.gameB],
        serverA: snap.serverA,
        winner: snap.winner,
        chanceA: snap.winner ? (snap.winner === 1 ? 1 : 0) : liveChance(model, snap.state),
        line: fullLine.slice(0, at + 1),
      }}
      notice={null}
      actions={
        <Link href="/pickem" className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-muted">
          Start a real one from any upcoming match
        </Link>
      }
      scoreControls={
        <div className="mt-4 space-y-2 border-t border-border pt-3">
          <p className="text-xs text-muted">
            Demo replay of a real result. The set scores are real; the point order is simulated.
          </p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <button
              type="button"
              onClick={() => (over ? restart() : setPlaying((p) => !p))}
              className="rounded-lg border border-accent bg-accent px-3 py-1.5 font-medium text-background"
            >
              {over ? "Replay" : playing ? "Pause" : at === 0 ? "Play the match" : "Resume"}
            </button>
            <button
              type="button"
              disabled={over}
              onClick={() => setAt((i) => Math.min(points.length, i + 1))}
              className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-muted disabled:opacity-50"
            >
              Next point
            </button>
            <div role="group" aria-label="Speed" className="flex overflow-hidden rounded-lg border border-border">
              {SPEEDS.map((s, i) => (
                <button
                  key={s.label}
                  type="button"
                  aria-pressed={speed === i}
                  onClick={() => setSpeed(i)}
                  className={`px-2.5 py-1.5 ${speed === i ? "bg-accent-soft font-medium" : "hover:bg-surface-muted"}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted tabular-nums">
              Point {at} of {points.length}
            </span>
          </div>
        </div>
      }
      bursts={bursts}
      openKeys={openCalls(snap)}
      myCall={(key) => myCalls.find((c) => c.call_key === key)?.side}
      onCall={call}
      callRows={callRows(callTable(calls, snap), nick)}
      chat={chat}
      meId={ME}
      onSend={sendChat}
      onReact={(emoji) => burst(emoji, "You")}
      members={[
        { id: BOTS[0].id, nickname: `${BOTS[0].nickname} (bot)`, host: true, online: true },
        { id: BOTS[1].id, nickname: `${BOTS[1].nickname} (bot)`, host: false, online: true },
        { id: BOTS[2].id, nickname: `${BOTS[2].nickname} (bot)`, host: false, online: true },
        { id: ME, nickname: "You", host: false, online: true },
      ]}
      footnote={
        <>
          This demo runs only in your browser: nothing you type is sent anywhere. In a real party, friends join with an invite link,
          chat in real time, and the host keeps score (or it follows live scores when they’re available). Win chances are our
          model’s estimates, not betting advice.
        </>
      }
    />
  );
}
