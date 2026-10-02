"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { DrawExplorer } from "@/components/draw-explorer";
import { bracketRounds, drawChances, type DrawModel } from "@/lib/draw-model";
import type { PlayedResult } from "@/lib/title-odds";

import { loadClient, signInWithGoogle, useUser } from "./use-user";

type Standing = { name: string; is_me: boolean; score: number; max_score: number };

/** Matches to pick in a full bracket (byes don't count). */
function picksNeeded(model: DrawModel): number {
  const real = drawChances(model);
  return bracketRounds(model, real, real)
    .flat()
    .filter((m) => !m.slots.some((s) => s.bye)).length;
}

/**
 * Bracket Challenge for a tournament. Open: fill in and save your bracket (the database refuses
 * changes once the first result is in). Closed: your score and the standings.
 */
export function BracketChallenge({ model, open }: { model: DrawModel; open: boolean }) {
  const user = useUser();
  const pathname = usePathname();
  const [picks, setPicks] = useState<PlayedResult[]>([]);
  const [saved, setSaved] = useState<{ picks: number; score: number; max: number } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [standings, setStandings] = useState<Standing[] | null>(null);
  const needed = useMemo(() => picksNeeded(model), [model]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = await loadClient();
      const [{ data: board }, entry] = await Promise.all([
        supabase.rpc("bracket_leaderboard", { p_tournament_id: model.tournamentId }),
        user ? supabase.from("bracket_entries").select("picks, score, max_score").eq("tournament_id", model.tournamentId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      if (cancelled) return;
      setStandings((board ?? []) as Standing[]);
      if (entry.data) {
        const list = ((entry.data.picks ?? []) as { w: string; l: string }[]).map((p) => ({ winner: p.w, loser: p.l }));
        setPicks(list);
        setSaved({ picks: list.length, score: entry.data.score, max: entry.data.max_score });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, model.tournamentId]);

  async function save() {
    if (!user) return signInWithGoogle(pathname);
    setBusy(true);
    setStatus(null);
    const supabase = await loadClient();
    const body = { picks: picks.map((p) => ({ w: p.winner, l: p.loser })), updated_at: new Date().toISOString() };
    const { error } = saved
      ? await supabase.from("bracket_entries").update(body).eq("tournament_id", model.tournamentId)
      : await supabase.from("bracket_entries").insert({ tournament_id: model.tournamentId, ...body });
    setBusy(false);
    if (error) {
      setStatus("The bracket is locked: the first results are in.");
      return;
    }
    setSaved({ picks: picks.length, score: 0, max: 0 });
    setStatus(picks.length < needed ? `Saved ${picks.length} of ${needed} picks. Finish before the first result is in.` : "Saved. Good luck!");
  }

  // Closed with no entry of yours and nobody on the board: nothing to show.
  if (!open && !saved && !standings?.length) return null;

  return (
    <section aria-labelledby="challenge-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="challenge-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
          Bracket Challenge
        </h2>
        {open && (
          <span className="text-xs text-muted tabular-nums">
            {picks.length} of {needed} picks
          </span>
        )}
      </div>

      {open ? (
        <>
          <p className="text-sm text-muted">
            Pick the whole draw before the first result. Points per correct pick double each round (10, 20, 40…), so every round is
            worth the same.
          </p>
          <DrawExplorer model={model} picks={picks} onPicksChange={setPicks} challenge />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={busy || user === undefined || picks.length === 0}
              className="rounded-lg border border-accent bg-accent px-4 py-2 text-sm font-medium text-background disabled:opacity-60"
            >
              {user ? (saved ? "Update my bracket" : "Save my bracket") : "Sign in to save"}
            </button>
            {status && (
              <p role="status" className="text-sm text-muted">
                {status}
              </p>
            )}
          </div>
        </>
      ) : saved ? (
        <p className="rounded-xl border border-border bg-surface p-4 text-sm">
          Your bracket: <span className="font-semibold tabular-nums">{saved.score}</span> points so far, up to{" "}
          <span className="tabular-nums">{saved.max}</span> possible.
        </p>
      ) : null}

      {standings && standings.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Standings</h3>
          <ol className="space-y-1.5 text-sm">
            {standings.slice(0, 10).map((s, i) => (
              <li key={`${s.name}-${i}`} className={`flex items-center gap-2 ${s.is_me ? "font-medium" : ""}`}>
                <span className="w-4 shrink-0 text-right text-xs text-muted tabular-nums">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                <span className="shrink-0 text-xs text-muted tabular-nums">max {s.max_score}</span>
                <span className="w-10 shrink-0 text-right font-semibold tabular-nums">{s.score}</span>
              </li>
            ))}
          </ol>
          <p className="mt-2 text-xs text-muted">Players appear here with a leaderboard name (set it on Pick’em).</p>
        </div>
      )}
    </section>
  );
}
