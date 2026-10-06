"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Flag } from "@/components/flag";

import { MomentumChart } from "./momentum-chart";

export type MatchInfo = {
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

export type ChatLine = { id: string; uid: string; nick: string; text: string; at: number };
export type Burst = { id: string; emoji: string; nick: string };
export type RoomMember = { id: string; nickname: string; host: boolean; online: boolean };

export const REACTIONS = ["🎾", "🔥", "😱", "👏", "😬", "🙌"];
const pct = (p: number) => `${Math.round(p * 100)}%`;

/** What the scoreboard shows, from live data or a replayed point log. */
export interface Scoreboard {
  sets: { a: number; b: number }[];
  game: [string, string];
  serverA: boolean | null;
  winner: 1 | 2 | null;
  chanceA: number | null;
  line: number[];
}

export interface RoomProps {
  match: MatchInfo;
  score: Scoreboard;
  /** Buttons at the top right (invite link, end party, demo playback). */
  actions: React.ReactNode;
  notice: string | null;
  /** Under the score: the host's scorekeeping buttons or the demo's playback controls. */
  scoreControls?: React.ReactNode;
  bursts: Burst[];
  openKeys: string[];
  myCall: (key: string) => number | undefined;
  onCall: (key: string, side: 1 | 2) => void;
  /** Room call leaderboard: nickname and record, best first. */
  callRows: { id: string; nickname: string; right: number; settled: number }[];
  chat: ChatLine[];
  meId: string;
  onSend: (text: string) => void;
  onReact: (emoji: string) => void;
  members: RoomMember[];
  onRemove?: (id: string) => void;
  footnote: React.ReactNode;
}

/** The watch-party room: score, win chance, momentum, calls, chat and who's here. */
export function PartyRoom(props: RoomProps) {
  const { match, score, members } = props;
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
            {match.round ? ` · ${match.round}` : ""} · {members.filter((m) => m.online).length} watching
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">{props.actions}</div>
      </header>
      {props.notice && (
        <p role="status" className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm">
          {props.notice}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-5">
          <section aria-label="Score" className="relative rounded-xl border border-border bg-surface p-4">
            {[1, 2].map((side) => {
              const p = side === 1 ? match.a : match.b;
              const serving = score.serverA !== null && score.serverA === (side === 1);
              return (
                <div key={side} className="flex items-center gap-2 py-1">
                  <Flag code={p.countryCode} reserve />
                  <span className={`min-w-0 flex-1 truncate font-medium ${score.winner === side ? "text-accent" : ""}`}>{p.name}</span>
                  {serving && !score.winner && <span className="size-2 rounded-full bg-accent" title="Serving" />}
                  {score.sets.map((s, i) => (
                    <span key={i} className="w-5 text-center font-mono tabular-nums">
                      {side === 1 ? s.a : s.b}
                    </span>
                  ))}
                  {!score.winner && (
                    <span className="w-9 rounded bg-accent-soft text-center font-mono text-sm text-accent tabular-nums">{score.game[side - 1]}</span>
                  )}
                </div>
              );
            })}
            {score.chanceA !== null && (
              <div className="mt-3">
                <div className="flex justify-between text-sm font-semibold tabular-nums">
                  <span>{pct(score.chanceA)}</span>
                  <span className="text-xs font-normal text-muted">chance to win</span>
                  <span>{pct(1 - score.chanceA)}</span>
                </div>
                <div aria-hidden className="mt-1 flex h-2 overflow-hidden rounded-full bg-surface-muted">
                  <span className="bg-chart-line transition-all duration-500" style={{ width: `${score.chanceA * 100}%` }} />
                </div>
              </div>
            )}
            {/* Reactions float over the scoreboard for a few seconds. */}
            <div aria-live="polite" className="pointer-events-none absolute left-1/2 top-1 flex -translate-x-1/2 gap-1">
              {props.bursts.map((b) => (
                <span key={b.id} className="animate-bounce text-xl" title={b.nick}>
                  {b.emoji}
                  <span className="sr-only"> from {b.nick}</span>
                </span>
              ))}
            </div>
            {props.scoreControls}
          </section>

          {score.line.length >= 2 && (
            <section aria-label="Momentum" className="rounded-xl border border-border bg-surface p-4">
              <MomentumChart line={score.line} nameA={match.a.name} nameB={match.b.name} />
            </section>
          )}

          <section aria-labelledby="calls-heading" className="rounded-xl border border-border bg-surface p-4">
            <h2 id="calls-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              Call it
            </h2>
            {props.openKeys.length === 0 ? (
              <p className="text-sm text-muted">{score.winner ? "Match over." : "Calls open before each set."}</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {props.openKeys.map((key) => {
                  const mine = props.myCall(key);
                  return (
                    <li key={key}>
                      <p className="mb-1 text-xs text-muted">{key === "match" ? "Who wins the match?" : `Who wins set ${key.slice(4)}?`}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {([1, 2] as const).map((side) => (
                          <button
                            key={side}
                            type="button"
                            aria-pressed={mine === side}
                            onClick={() => props.onCall(key, side)}
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
            {props.callRows.length > 0 && (
              <ol className="mt-3 space-y-1 border-t border-border pt-2 text-sm">
                {props.callRows.map((r, i) => (
                  <li key={r.id} className="flex gap-2">
                    <span className="w-4 text-right text-xs text-muted">{i + 1}</span>
                    <span className="flex-1 truncate">{r.nickname}</span>
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
          <Chat lines={props.chat} me={props.meId} onSend={props.onSend} onReact={props.onReact} />
          <section aria-labelledby="who-heading" className="rounded-xl border border-border bg-surface p-4">
            <h2 id="who-heading" className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
              In the room
            </h2>
            <ul className="space-y-1 text-sm">
              {members.map((m) => (
                <li key={m.id} className="flex items-center gap-2">
                  <span className={`size-2 rounded-full ${m.online ? "bg-accent" : "bg-surface-muted"}`} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {m.nickname}
                    {m.host ? <span className="text-xs text-muted"> (host)</span> : null}
                    <span className="sr-only">{m.online ? ", here now" : ", away"}</span>
                  </span>
                  {props.onRemove && m.id !== props.meId && (
                    <button type="button" onClick={() => props.onRemove!(m.id)} className="text-xs text-muted hover:text-foreground hover:underline">
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
      <p className="text-xs text-muted">{props.footnote}</p>
    </div>
  );
}

/** Sorts a call table into leaderboard rows: most right, then fewest settled. */
export function callRows(table: Map<string, { right: number; settled: number }>, nick: (id: string) => string) {
  return [...table.entries()]
    .sort((x, y) => y[1].right - x[1].right || x[1].settled - y[1].settled)
    .map(([id, r]) => ({ id, nickname: nick(id), ...r }));
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
