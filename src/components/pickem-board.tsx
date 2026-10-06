"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Flag } from "@/components/flag";
import { pickStats, type PickStats } from "@/lib/badges";

import { loadClient, signInWithGoogle, useUser } from "./use-user";

export interface PickemMatch {
  id: number;
  tournament: string;
  round: string | null;
  p1: { name: string; countryCode: string | null };
  p2: { name: string; countryCode: string | null };
  model1: number;
}

type Row = { name: string; is_me: boolean; correct: number; settled: number; model_correct: number };

const pct = (p: number) => `${Math.round(p * 100)}%`;

// Guest picks: signed-out visitors can pick too. They live in this browser until sign-in, when
// the ones still open move into the account.
const GUEST_KEY = "pickem:guest";
function readGuest(): Map<number, 1 | 2> {
  try {
    const raw = JSON.parse(localStorage.getItem(GUEST_KEY) ?? "{}") as Record<string, number>;
    return new Map(Object.entries(raw).filter(([, v]) => v === 1 || v === 2).map(([k, v]) => [Number(k), v as 1 | 2]));
  } catch {
    return new Map();
  }
}
function writeGuest(picks: Map<number, 1 | 2>) {
  try {
    if (picks.size === 0) localStorage.removeItem(GUEST_KEY);
    else localStorage.setItem(GUEST_KEY, JSON.stringify(Object.fromEntries(picks)));
  } catch {
    // Storage blocked (private mode): guest picks last for this visit only.
  }
}
type GuestRecord = { correct: number; settled: number; model: number };

/** Pick buttons for open matches, your record, and your leaderboard name. */
export function PickemBoard({
  matches,
  weekStart,
  seasonStart,
  signedOut,
}: {
  matches: PickemMatch[];
  weekStart: string;
  seasonStart: string;
  /** The server saw no session cookie, so the visitor is a guest before the client confirms it. */
  signedOut: boolean;
}) {
  const user = useUser();
  const guestView = user === null || (user === undefined && signedOut);
  const pathname = usePathname();
  const [picks, setPicks] = useState<Map<number, 1 | 2>>(new Map());
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<{ week: Row | null; season: Row | null } | null>(null);
  const [stats, setStats] = useState<PickStats | null>(null);

  const [guest, setGuest] = useState<Map<number, 1 | 2>>(new Map());
  const [guestRecord, setGuestRecord] = useState<GuestRecord | null>(null);
  const [moved, setMoved] = useState<number | null>(null);

  // Signed out: load guest picks and settle the finished ones against real results.
  useEffect(() => {
    if (user !== null) return;
    let cancelled = false;
    (async () => {
      const stored = readGuest();
      if (cancelled) return;
      setGuest(stored);
      if (stored.size === 0) return;
      const supabase = await loadClient();
      const { data } = await supabase
        .from("matches")
        .select("id, winner_side, pre_match_p1, result_detail")
        .in("id", [...stored.keys()])
        .eq("status", "final")
        .eq("confirmed", true);
      if (cancelled) return;
      const settled = (data ?? []).filter((m) => (m.winner_side === 1 || m.winner_side === 2) && m.result_detail !== "walkover");
      setGuestRecord({
        settled: settled.length,
        correct: settled.filter((m) => stored.get(m.id) === m.winner_side).length,
        model: settled.filter((m) => m.pre_match_p1 !== null && (m.pre_match_p1 >= 0.5) === (m.winner_side === 1)).length,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const supabase = await loadClient();
      // Just signed in: move guest picks into the account (finished matches are refused).
      const pending = readGuest();
      if (pending.size > 0) {
        let n = 0;
        for (const [match_id, side] of pending) {
          const { error } = await supabase.from("picks").insert({ match_id, side });
          if (!error) n++;
        }
        writeGuest(new Map());
        if (!cancelled && n > 0) setMoved(n);
      }
      const ids = matches.map((m) => m.id);
      const [{ data }, week, season, history] = await Promise.all([
        ids.length ? supabase.from("picks").select("match_id, side").in("match_id", ids) : Promise.resolve({ data: [] }),
        supabase.rpc("pickem_leaderboard", { p_since: weekStart }),
        supabase.rpc("pickem_leaderboard", { p_since: seasonStart }),
        supabase.rpc("my_pick_history"),
      ]);
      if (cancelled) return;
      setStats(
        pickStats(
          (history.data ?? []).map((h) => ({ side: h.side as 1 | 2, winner: h.winner_side as 1 | 2, p1: h.pre_match_p1, settledAt: h.settled_at })),
        ),
      );
      setPicks(new Map((data ?? []).map((p) => [p.match_id, p.side as 1 | 2])));
      setMine({ week: week.data?.find((r) => r.is_me) ?? null, season: season.data?.find((r) => r.is_me) ?? null });
    })();
    return () => {
      cancelled = true;
    };
  }, [user, matches, weekStart, seasonStart]);

  async function pick(matchId: number, side: 1 | 2) {
    if (user === undefined && !signedOut) return;
    if (!user) {
      const next = new Map(guest);
      if (next.get(matchId) === side) next.delete(matchId);
      else next.set(matchId, side);
      setGuest(next);
      writeGuest(next);
      return;
    }
    setBusy(matchId);
    setError(null);
    const supabase = await loadClient();
    const current = picks.get(matchId);
    const { error } =
      current === side
        ? await supabase.from("picks").delete().eq("match_id", matchId)
        : current
          ? await supabase.from("picks").update({ side, picked_at: new Date().toISOString() }).eq("match_id", matchId)
          : await supabase.from("picks").insert({ match_id: matchId, side });
    if (error) {
      setError("That match is closed for picks.");
    } else {
      setPicks((prev) => {
        const next = new Map(prev);
        if (current === side) next.delete(matchId);
        else next.set(matchId, side);
        return next;
      });
    }
    setBusy(null);
  }

  return (
    <div className="space-y-5">
      {user && <MyRecord mine={mine} />}
      {user && stats && <Badges stats={stats} />}
      {user && <LeaderboardName />}
      {guestView && (
        <div className="space-y-1 rounded-xl border border-border bg-surface p-4 text-sm">
          <p>
            {guest.size === 0 ? "Try it: tap a player to pick them. " : `You’ve made ${guest.size} ${guest.size === 1 ? "pick" : "picks"} as a guest, saved in this browser only. `}
            <button type="button" onClick={() => signInWithGoogle(pathname)} className="font-medium text-accent hover:underline">
              Sign in with Google
            </button>{" "}
            to keep your picks{guest.size > 0 ? " (open ones move to your account)" : ""} and join the leaderboard. Your picks are private; only
            a leaderboard name you choose is ever shown to others.
          </p>
          {guestRecord && guestRecord.settled > 0 && (
            <p className="text-muted">
              Your guest record: <span className="font-semibold text-foreground tabular-nums">{guestRecord.correct}–{guestRecord.settled - guestRecord.correct}</span>
              {" · "}model on the same matches: {guestRecord.model}–{guestRecord.settled - guestRecord.model}
            </p>
          )}
        </div>
      )}
      {moved !== null && (
        <p role="status" className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm">
          Moved {moved} guest {moved === 1 ? "pick" : "picks"} into your account.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      {matches.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-muted">No open matches right now. New pairings appear as draws are updated.</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {matches.map((m) => (
            <li key={m.id} className="space-y-2 px-4 py-3 text-sm">
              <p className="text-xs text-muted">
                {m.tournament}
                {m.round ? ` · ${m.round}` : ""} ·{" "}
                <Link href={`/matches/${m.id}`} className="hover:text-foreground hover:underline">
                  Preview
                </Link>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {([1, 2] as const).map((side) => {
                  const p = side === 1 ? m.p1 : m.p2;
                  const on = (user ? picks : guest).get(m.id) === side;
                  return (
                    <button
                      key={side}
                      type="button"
                      disabled={busy === m.id || (user === undefined && !signedOut)}
                      onClick={() => pick(m.id, side)}
                      aria-pressed={user === undefined && !signedOut ? undefined : on}
                      className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-left disabled:opacity-60 ${
                        on ? "border-accent bg-accent-soft font-medium" : "border-border hover:bg-surface-muted"
                      }`}
                    >
                      <Flag code={p.countryCode} reserve />
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted" title="Model's chance">
                        {pct(side === 1 ? m.model1 : 1 - m.model1)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MyRecord({ mine }: { mine: { week: Row | null; season: Row | null } | null }) {
  const cell = (label: string, r: Row | null | undefined) => (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{r ? `${r.correct}–${r.settled - r.correct}` : "–"}</p>
      <p className="text-xs text-muted">{r ? `Model on the same matches: ${r.model_correct}–${r.settled - r.model_correct}` : "No settled picks yet"}</p>
    </div>
  );
  return (
    <div className="grid grid-cols-2 gap-3">
      {cell("You this week", mine?.week)}
      {cell("You this season", mine?.season)}
    </div>
  );
}

function LeaderboardName() {
  const [name, setName] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadClient()
      .then((s) => s.from("profiles").select("leaderboard_name").maybeSingle())
      .then(({ data }) => {
        if (cancelled) return;
        setName(data?.leaderboard_name ?? "");
        setDraft(data?.leaderboard_name ?? "");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(value: string | null) {
    setStatus(null);
    const supabase = await loadClient();
    const { data: claims } = await supabase.auth.getClaims();
    const id = claims?.claims.sub;
    if (!id) return;
    const { error } = await supabase.from("profiles").update({ leaderboard_name: value }).eq("id", id);
    if (error) {
      setStatus(error.code === "23505" ? "That name is taken." : "Use 3–24 letters, numbers, spaces, dots, dashes or underscores.");
      return;
    }
    setName(value ?? "");
    setDraft(value ?? "");
    setStatus(value ? "Saved. You're on the leaderboard." : "Removed from the leaderboard.");
  }

  if (name === null) return null;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save(draft.trim() || null);
      }}
      className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface p-4 text-sm"
    >
      <label className="min-w-0 flex-1 basis-56">
        <span className="block text-xs text-muted">Leaderboard name (optional, public)</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={24}
          placeholder="Stay private"
          className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5"
        />
      </label>
      <button type="submit" className="rounded-lg border border-accent bg-accent px-3 py-1.5 font-medium text-background">
        Save
      </button>
      {name && (
        <button type="button" onClick={() => save(null)} className="rounded-lg border border-border px-3 py-1.5 hover:bg-surface-muted">
          Go private
        </button>
      )}
      {status && (
        <p role="status" className="basis-full text-xs text-muted">
          {status}
        </p>
      )}
    </form>
  );
}

function Badges({ stats }: { stats: PickStats }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 text-sm">
      <p>
        Current streak <span className="font-semibold tabular-nums">{stats.currentStreak}</span> · best{" "}
        <span className="font-semibold tabular-nums">{stats.bestStreak}</span>
      </p>
      {stats.badges.length === 0 ? (
        <p className="mt-1 text-xs text-muted">Badges appear here as your picks are settled: streaks, upset calls, perfect days.</p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-2">
          {stats.badges.map((b) => (
            <li key={b.id} title={b.description} className="rounded-full border border-accent/50 bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
              {b.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
