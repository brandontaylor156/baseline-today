import Link from "next/link";

import type { ScoreMatch, ScoreSide } from "@/lib/data/scores-group";
import { statusLabel } from "@/lib/data/scores-group";

import { Flag } from "./flag";
import { LocalTime } from "./local-time";

function serverSide(m: ScoreMatch): 1 | 2 | null {
  if (!m.isLive || !m.server) return null;
  const s = m.server.toLowerCase();
  if (s === "1" || s === "player1") return 1;
  if (s === "2" || s === "player2") return 2;
  if (m.player1 && ((m.player1.id !== null && s === String(m.player1.id)) || m.player1.name.toLowerCase() === s)) return 1;
  if (m.player2 && ((m.player2.id !== null && s === String(m.player2.id)) || m.player2.name.toLowerCase() === s)) return 2;
  return null;
}

function Row({ m, side }: { m: ScoreMatch; side: 1 | 2 }) {
  const player: ScoreSide | null = side === 1 ? m.player1 : m.player2;
  const won = m.winner === side;
  const lost = m.winner !== null && !won;
  const serving = serverSide(m) === side;
  const game = side === 1 ? m.p1Game : m.p2Game;

  return (
    <div className={`flex items-center gap-2 ${lost ? "text-muted" : ""}`}>
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <Flag code={player?.countryCode ?? null} reserve />
        {player?.id != null ? (
          <Link href={`/players/${player.id}`} className={`truncate hover:underline ${won ? "font-semibold" : ""}`}>
            {player.name}
          </Link>
        ) : player ? (
          <span className={`truncate ${won ? "font-semibold" : ""}`}>{player.name}</span>
        ) : (
          <span className="truncate text-muted">TBD</span>
        )}
        {serving && (
          <span className="size-1.5 shrink-0 rounded-full bg-accent" title="Serving">
            <span className="sr-only">serving</span>
          </span>
        )}
      </span>
      <span className="flex shrink-0 gap-1.5 font-mono text-sm tabular-nums">
        {m.sets.map((s) => {
          const mine = side === 1 ? s.p1 : s.p2;
          const theirs = side === 1 ? s.p2 : s.p1;
          const tb = side === 1 ? s.p1Tiebreak : s.p2Tiebreak;
          const tookSet = mine !== null && theirs !== null && mine > theirs && (mine >= 6 || m.status === "final");
          return (
            <span key={s.set} className={`w-4 text-center ${tookSet ? "font-semibold" : ""}`}>
              {mine ?? "–"}
              {tb !== null && <sup className="text-[9px]">{tb}</sup>}
            </span>
          );
        })}
        {m.isLive && game !== null && (
          <span className="w-6 rounded bg-accent-soft text-center text-accent">{game}</span>
        )}
      </span>
    </div>
  );
}

export function MatchCard({ match: m }: { match: ScoreMatch }) {
  const label = statusLabel(m);
  return (
    <article
      aria-label={`${m.player1?.name ?? "TBD"} vs ${m.player2?.name ?? "TBD"}, ${label}`}
      className={`rounded-xl border bg-surface p-3 text-sm ${m.isLive ? "border-accent/60" : "border-border"}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2 text-xs text-muted">
        <span className="truncate">{m.round ?? ""}</span>
        <span className={`shrink-0 ${m.isLive ? "font-semibold text-accent" : ""}`}>
          {m.isLive && <span aria-hidden className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-accent align-middle" />}
          {label === "Scheduled" && m.scheduledAt ? <LocalTime iso={m.scheduledAt} fallback={m.notBefore} /> : label}
        </span>
      </div>
      <div className="space-y-1.5">
        <Row m={m} side={1} />
        <Row m={m} side={2} />
      </div>
    </article>
  );
}
