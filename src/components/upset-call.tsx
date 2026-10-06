"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { UpsetCall } from "@/lib/data/upset-call";

type Saved = { call: "upset" | "hold"; matchId: number; underdogSide: 1 | 2; result?: "right" | "wrong" };
type History = Record<string, Saved>;
const KEY = "upset-call:history";

function read(): History {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as History;
  } catch {
    return {};
  }
}
function write(h: History) {
  try {
    localStorage.setItem(KEY, JSON.stringify(h));
  } catch {
    // Storage blocked: works for this visit only.
  }
}

/** Upset of the day: call whether the underdog wins, against the model (which always says no). */
export function UpsetCallGame({ call }: { call: UpsetCall }) {
  const [history, setHistory] = useState<History>({});
  const [winner, setWinner] = useState<1 | 2 | null>(null);
  const mine: Saved | undefined = history[call.day];

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const h = read();
      // Settle earlier calls whose matches have finished.
      for (const [day, c] of Object.entries(h)) {
        if (c.result) continue;
        const res = await fetch(`/api/matches/${c.matchId}`).catch(() => null);
        if (!res?.ok) continue;
        const m = (await res.json()) as { status: string; winner: number | null };
        if (m.status !== "final" || (m.winner !== 1 && m.winner !== 2)) continue;
        if (day === call.day) setWinner(m.winner);
        const upset = m.winner === c.underdogSide;
        h[day] = { ...c, result: (c.call === "upset") === upset ? "right" : "wrong" };
      }
      if (!cancelled) {
        write(h);
        setHistory(h);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [call]);

  function choose(c: "upset" | "hold") {
    const h = { ...read(), [call.day]: { call: c, matchId: call.matchId, underdogSide: call.underdog.side } };
    write(h);
    setHistory(h);
  }

  const settled = Object.values(history).filter((c) => c.result);
  const right = settled.filter((c) => c.result === "right").length;
  const pct = Math.round(call.underdogChance * 100);
  // Settled now, or on an earlier visit.
  const result = mine?.result ?? (winner === null || !mine ? null : (winner === call.underdog.side) === (mine.call === "upset") ? "right" : "wrong");

  return (
    <section aria-labelledby="upset-heading" className="space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-5">
      <h2 id="upset-heading" className="text-lg font-semibold">
        Will {call.underdog.name} upset {call.favorite.name}?
      </h2>
      <p className="text-sm text-muted">
        <Link href={`/matches/${call.matchId}`} className="hover:underline">
          {call.tournament}
          {call.round ? ` · ${call.round}` : ""}
        </Link>
        . Our model gives {call.underdog.name} a {pct}% chance, so it says no. Do you know better?
      </p>
      {!mine ? (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <button type="button" onClick={() => choose("upset")} className="rounded-lg border border-accent bg-accent px-3 py-2 font-medium text-background">
            Yes, upset
          </button>
          <button type="button" onClick={() => choose("hold")} className="rounded-lg border border-border px-3 py-2 font-medium hover:bg-surface-muted">
            No, {call.favorite.name.split(" ").at(-1)} wins
          </button>
        </div>
      ) : (
        <p role="status" className="text-sm">
          You said <strong>{mine.call === "upset" ? "upset" : `${call.favorite.name} wins`}</strong>.{" "}
          {result === null ? "Come back after the match to see who was right." : result === "right" ? "✅ You were right." : "❌ Not this time."}
        </p>
      )}
      <p className="text-xs text-muted">
        Your record: {right} right of {settled.length} settled. Calls stay in this browser. Just for fun: no prizes, no money.
      </p>
    </section>
  );
}
