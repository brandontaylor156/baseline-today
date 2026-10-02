"use client";

import { useMemo, useState, type ReactNode } from "react";

import { Flag } from "@/components/flag";
import { TitleChances } from "@/components/title-chances";
import { bracketRounds, drawChances, roundName, titleChances, type BracketMatch, type DrawModel, type DrawPlayer } from "@/lib/draw-model";
import type { PlayedResult } from "@/lib/title-odds";

const pct = (p: number) => (p >= 0.995 ? "99%+" : p > 0 && p < 0.005 ? "<1%" : `${Math.round(p * 100)}%`);
// Height per match in the first shown round; later rounds spread out to line up like a tree.
const MATCH_REM = 4;

/**
 * Title chances and the bracket for a tournament in progress. "What if": pick the winner of any
 * match whose players are known, and every chance updates (computed here in the browser).
 */
export function DrawExplorer({
  model,
  children,
  picks: controlled,
  onPicksChange,
  challenge = false,
}: {
  model: DrawModel;
  children?: ReactNode;
  /** Controlled picks (Bracket Challenge); otherwise "what if" picks live here. */
  picks?: PlayedResult[];
  onPicksChange?: (picks: PlayedResult[]) => void;
  /** Bracket Challenge: every round shown, wording about your bracket. */
  challenge?: boolean;
}) {
  const [local, setLocal] = useState<PlayedResult[]>([]);
  const picks = controlled ?? local;
  const setPicks = (update: (prev: PlayedResult[]) => PlayedResult[]) => {
    const next = update(picks);
    if (onPicksChange) onPicksChange(next);
    else setLocal(next);
  };
  const [showAll, setShowAll] = useState(challenge);
  const byKey = useMemo(() => new Map(model.players.map((p) => [p.key, p])), [model]);

  const realReach = useMemo(() => drawChances(model), [model]);
  const reach = useMemo(() => (picks.length ? drawChances(model, picks) : realReach), [model, picks, realReach]);
  const rounds = useMemo(() => bracketRounds(model, reach, realReach), [model, reach, realReach]);
  const odds = useMemo(() => titleChances(model, picks), [model, picks]);
  const realTitle = useMemo(() => new Map(model.players.map((p) => [p.key, realReach.get(p.key)?.at(-1) ?? 0])), [model, realReach]);

  // Rounds from the first one with a match still to play (earlier ones on request).
  const firstOpen = rounds.findIndex((ms) => ms.some((m) => !m.real));
  const from = showAll || firstOpen < 0 ? 0 : firstOpen;
  const shown = rounds.slice(from);
  const tall = shown[0]?.length ?? 1;

  function pick(m: BracketMatch, winner: string) {
    const loser = m.slots.find((s) => s.key !== winner)?.key;
    if (!loser) return;
    setPicks((prev) => {
      const same = prev.find((p) => p.winner === winner && p.loser === loser);
      // Changing or undoing a pick also drops later picks that depended on it.
      const involved = new Set([winner, loser]);
      const kept = prev.filter((p) => !(involved.has(p.winner) || involved.has(p.loser)) || roundOf(p) < m.round);
      return same ? kept : [...kept, { winner, loser }];
    });
  }

  function roundOf(p: PlayedResult): number {
    const a = byKey.get(p.winner)?.position ?? 0;
    const b = byKey.get(p.loser)?.position ?? 0;
    return Math.floor(Math.log2(a ^ b)) + 1;
  }

  const isPick = (m: BracketMatch, key: string) => picks.some((p) => p.winner === key && m.slots.some((s) => s.key === p.loser));

  return (
    <div className="space-y-6">
      {odds && <TitleChances odds={odds} previous={picks.length ? realTitle : undefined} />}

      {children}

      <section aria-labelledby="bracket-heading" className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="bracket-heading" className="text-sm font-semibold uppercase tracking-wide text-muted">
            Draw
          </h2>
          <div className="flex items-center gap-2 text-sm">
            {picks.length > 0 && (
              <button type="button" onClick={() => setPicks(() => [])} className="rounded-md border border-border px-2.5 py-1 hover:bg-surface-muted">
                Reset {picks.length} pick{picks.length === 1 ? "" : "s"}
              </button>
            )}
            {firstOpen > 0 && (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="rounded-md border border-border px-2.5 py-1 text-muted hover:text-foreground">
                {showAll ? "Hide finished rounds" : "Show finished rounds"}
              </button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted">
          {challenge
            ? "Your bracket: tap the winner of each match, round by round, through to the champion. Tap again to undo."
            : "What if? Tap a player to have them win that match; title chances above update. Tap again to undo."}
        </p>
        {/* The bracket scrolls sideways on its own; the page never does. */}
        <div className="-mx-4 overflow-x-auto px-4 pb-2">
          <div className="flex gap-3" style={{ minWidth: "min-content" }}>
            {shown.map((matches) => (
              <section key={matches[0].round} aria-label={roundName(matches[0].round, model.rounds)} className="w-56 shrink-0">
                <h3 className="mb-2 text-xs font-semibold">{roundName(matches[0].round, model.rounds)}</h3>
                <ol className="flex flex-col" style={{ height: `${tall * MATCH_REM}rem` }}>
                  {matches.map((m) => (
                    <li key={m.index} className="flex flex-1 items-center">
                      <Match m={m} byKey={byKey} reach={reach} pick={pick} isPick={isPick} />
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Match({
  m,
  byKey,
  reach,
  pick,
  isPick,
}: {
  m: BracketMatch;
  byKey: Map<string, DrawPlayer>;
  reach: Map<string, number[]>;
  pick: (m: BracketMatch, key: string) => void;
  isPick: (m: BracketMatch, key: string) => boolean;
}) {
  const open = !m.real && m.slots.every((s) => s.key !== null);
  return (
    <div className="w-full overflow-hidden rounded-lg border border-border bg-surface text-sm">
      {m.slots.map((s, i) => {
        if (s.bye) {
          return (
            <div key={i} className="flex h-[1.625rem] items-center px-2 text-xs text-muted">
              Bye
            </div>
          );
        }
        if (!s.key) {
          const p = s.likely ? byKey.get(s.likely.key) : undefined;
          return (
            <div key={i} className="flex h-[1.625rem] items-center gap-1.5 px-2 text-xs text-muted">
              <span className="min-w-0 flex-1 truncate italic">{p ? `Likely ${p.name}` : "To be decided"}</span>
              {s.likely && <span className="shrink-0 tabular-nums">{pct(s.likely.p)}</span>}
            </div>
          );
        }
        const p = byKey.get(s.key)!;
        const won = m.winner === s.key;
        const lost = m.winner !== null && !won;
        const chance = reach.get(s.key)?.[m.round] ?? 0;
        const picked = isPick(m, s.key);
        const content = (
          <>
            <Flag code={p.countryCode} reserve />
            <span className={`min-w-0 flex-1 truncate text-left ${won ? "font-semibold" : ""} ${lost ? "text-muted line-through decoration-1" : ""}`}>{p.name}</span>
            {p.seed && /^\d+$/.test(p.seed) && <span className="shrink-0 text-[10px] text-muted">{p.seed}</span>}
            <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted">{m.real ? (won ? "W" : "") : pct(chance)}</span>
          </>
        );
        const base = `flex h-[1.625rem] w-full items-center gap-1.5 px-2 ${i === 0 ? "border-b border-border" : ""}`;
        return open || (picked && !m.real) || (!m.real && m.winner !== null) ? (
          <button
            key={i}
            type="button"
            onClick={() => pick(m, s.key!)}
            aria-pressed={picked}
            aria-label={`Pick ${p.name} to win`}
            className={`${base} hover:bg-surface-muted ${picked ? "bg-accent-soft" : ""}`}
          >
            {content}
          </button>
        ) : (
          <div key={i} className={base}>
            {content}
          </div>
        );
      })}
    </div>
  );
}
