"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Flag } from "@/components/flag";
import { PlayerPicker } from "@/components/player-picker";
import { MAX_GUESSES, shareText, type Cell, type Feedback, type PuzzlePlayer } from "@/lib/puzzle";

type Saved = { rows: Feedback[]; answer: PuzzlePlayer | null; done: boolean; won: boolean };
const KEY = (day: string) => `puzzle:${day}`;
const HISTORY = "puzzle:history";

function load(day: string): Saved {
  try {
    return (JSON.parse(localStorage.getItem(KEY(day)) ?? "null") as Saved | null) ?? { rows: [], answer: null, done: false, won: false };
  } catch {
    return { rows: [], answer: null, done: false, won: false };
  }
}
function save(day: string, s: Saved) {
  try {
    localStorage.setItem(KEY(day), JSON.stringify(s));
    if (s.done) {
      const h = JSON.parse(localStorage.getItem(HISTORY) ?? "{}") as Record<string, boolean>;
      h[day] = s.won;
      localStorage.setItem(HISTORY, JSON.stringify(h));
    }
  } catch {
    // Storage blocked: the game still works for this visit.
  }
}
function stats(): { played: number; wins: number; streak: number } {
  try {
    const h = JSON.parse(localStorage.getItem(HISTORY) ?? "{}") as Record<string, boolean>;
    const days = Object.keys(h).sort();
    let streak = 0;
    for (let i = days.length - 1; i >= 0 && h[days[i]]; i--) streak++;
    return { played: days.length, wins: days.filter((d) => h[d]).length, streak };
  } catch {
    return { played: 0, wins: 0, streak: 0 };
  }
}

const STYLE: Record<Cell["result"], string> = {
  match: "border-accent bg-accent-soft text-foreground",
  close: "border-warn bg-surface-muted text-foreground",
  miss: "border-border bg-surface text-muted",
  unknown: "border-dashed border-border bg-surface text-muted",
};
const LABEL: Record<Cell["result"], string> = { match: "match", close: "close", miss: "no", unknown: "unknown" };

function CellBox({ c, children }: { c: Cell; children: React.ReactNode }) {
  const arrow = c.dir === "up" ? "↑" : c.dir === "down" ? "↓" : "";
  return (
    <td className="p-0.5">
      <span className={`flex h-10 items-center justify-center gap-0.5 rounded-md border text-xs tabular-nums ${STYLE[c.result]}`}>
        {children}
        {arrow && <span aria-hidden>{arrow}</span>}
        <span className="sr-only">
          ({LABEL[c.result]}
          {c.dir ? `, answer is ${c.dir === "up" ? "higher" : "lower"}` : ""})
        </span>
      </span>
    </td>
  );
}

/** Guess the player: six tries, each guess compared with the answer by country, age, rank, height and hand. */
export function PuzzleGame({ day, number, tour }: { day: string; number: number; tour: "atp" | "wta" }) {
  const [state, setState] = useState<Saved>({ rows: [], answer: null, done: false, won: false });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [record, setRecord] = useState({ played: 0, wins: 0, streak: 0 });

  useEffect(() => {
    queueMicrotask(() => {
      setState(load(day));
      setRecord(stats());
    });
  }, [day]);

  function update(next: Saved) {
    setState(next);
    save(day, next);
    if (next.done) setRecord(stats());
  }

  async function reveal(rows: Feedback[], won: boolean) {
    const res = await fetch(`/api/puzzle?day=${day}&reveal=1`);
    const answer = res.ok ? ((await res.json()) as { answer: PuzzlePlayer }).answer : null;
    update({ rows, answer, done: true, won });
  }

  async function guess(id: number) {
    if (state.done || busy) return;
    if (state.rows.some((r) => r.guess.id === id)) return setNotice("You’ve already guessed that player.");
    setBusy(true);
    setNotice(null);
    const res = await fetch("/api/puzzle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day, playerId: id }) });
    setBusy(false);
    if (!res.ok) return setNotice("Couldn’t check that guess. Try another player.");
    const { feedback, answer } = (await res.json()) as { feedback: Feedback; answer?: PuzzlePlayer };
    const rows = [...state.rows, feedback];
    if (feedback.correct) update({ rows, answer: answer ?? feedback.guess, done: true, won: true });
    else if (rows.length >= MAX_GUESSES) await reveal(rows, false);
    else update({ ...state, rows });
  }

  const left = MAX_GUESSES - state.rows.length;
  return (
    <div className="space-y-5">
      <p className="text-sm">
        Today’s player is in the <strong>{tour.toUpperCase()}</strong> top 100. You have {MAX_GUESSES} guesses; each one shows how close you are.
      </p>

      {!state.done && (
        <div className="max-w-md space-y-2">
          <PlayerPicker label={`Guess ${state.rows.length + 1} of ${MAX_GUESSES}`} tour={tour} onPick={(p) => void guess(p.id)} />
          <div className="flex items-center justify-between text-xs text-muted">
            <span>
              {left} {left === 1 ? "guess" : "guesses"} left
            </span>
            {state.rows.length > 0 && (
              <button type="button" onClick={() => void reveal(state.rows, false)} className="hover:text-foreground hover:underline">
                Give up
              </button>
            )}
          </div>
          {notice && (
            <p role="status" className="text-sm text-muted">
              {notice}
            </p>
          )}
        </div>
      )}

      {state.rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] table-fixed text-sm">
            <caption className="sr-only">Your guesses compared with the answer</caption>
            <thead className="text-xs text-muted">
              <tr>
                <th scope="col" className="w-[34%] px-1 py-1 text-left font-medium">Player</th>
                <th scope="col" className="px-1 py-1 font-medium">Country</th>
                <th scope="col" className="px-1 py-1 font-medium">Age</th>
                <th scope="col" className="px-1 py-1 font-medium">Rank</th>
                <th scope="col" className="px-1 py-1 font-medium">Height</th>
                <th scope="col" className="px-1 py-1 font-medium">Plays</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((r) => (
                <tr key={r.guess.id} aria-label={r.correct ? `${r.guess.name}: correct` : r.guess.name}>
                  <th scope="row" className="truncate px-1 text-left font-medium">
                    {r.correct ? "✅ " : ""}
                    {r.guess.name}
                  </th>
                  <CellBox c={r.correct ? { result: "match" } : r.country}>
                    <Flag code={r.guess.country} />
                    <span className="sr-only">{r.guess.country}</span>
                  </CellBox>
                  <CellBox c={r.correct ? { result: "match" } : r.age}>{r.guess.age ?? "?"}</CellBox>
                  <CellBox c={r.correct ? { result: "match" } : r.rank}>{r.guess.rank ? `#${r.guess.rank}` : "100+"}</CellBox>
                  <CellBox c={r.correct ? { result: "match" } : r.height}>{r.guess.heightCm ?? "?"}</CellBox>
                  <CellBox c={r.correct ? { result: "match" } : r.hand}>{r.guess.hand ? r.guess.hand[0].toUpperCase() : "?"}</CellBox>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-xs text-muted">Green: same. Outlined: close (age ±2, rank ±10, height ±5 cm). Arrows point toward the answer; ↑ on rank means a better rank.</p>
        </div>
      )}

      {state.done && state.answer && (
        <section aria-labelledby="result-heading" className="space-y-3 rounded-xl border border-border bg-surface p-4">
          <h2 id="result-heading" className="text-lg font-semibold">
            {state.won ? `Got it in ${state.rows.length}!` : "Out of guesses"}
          </h2>
          <p className="text-sm">
            It was{" "}
            <Link href={`/players/${state.answer.id}`} className="font-medium text-accent hover:underline">
              {state.answer.name}
            </Link>
            {state.answer.rank ? ` (#${state.answer.rank})` : ""}. New puzzle tomorrow at midnight UTC.
          </p>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(`${shareText(day, state.rows, state.won)}\nhttps://baseline-today.vercel.app/play`);
                setNotice("Result copied. No spoilers in it.");
              }}
              className="rounded-lg border border-accent bg-accent px-3 py-1.5 font-medium text-background"
            >
              Copy result
            </button>
            <span className="text-muted">
              Played {record.played} · won {record.wins} · streak {record.streak}
            </span>
          </div>
          {notice && (
            <p role="status" className="text-xs text-muted">
              {notice}
            </p>
          )}
        </section>
      )}
      <p className="text-xs text-muted">Puzzle #{number}. Your progress stays in this browser.</p>
    </div>
  );
}
