"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { loadClient, signInWithGoogle, useUser } from "./use-user";

type League = { id: string; name: string; invite_code: string; owner_id: string; is_public: boolean };
export type PublicLeague = { name: string; invite_code: string; members: number };
type Row = { nickname: string; is_me: boolean; correct: number; settled: number; bracket_points: number };
export type SampleRow = { nickname: string; strategy: string; correct: number; settled: number };

const NICK_HELP = "2–24 letters, numbers, spaces, dots, dashes or underscores.";

function errorText(message: string): string {
  if (/no league/i.test(message)) return "No league has that code.";
  if (/full/i.test(message)) return "That league is full.";
  if (/limit/i.test(message)) return "You can own up to 10 leagues.";
  if (/nickname|check|unique|duplicate/i.test(message)) return `That nickname is taken in this league or not allowed (${NICK_HELP})`;
  return "Something went wrong. Try again.";
}

/** Create, join and follow private leagues (members see nicknames only). */
export function LeaguesClient({ seasonStart, sample, directory }: { seasonStart: string; sample: SampleRow[]; directory: PublicLeague[] }) {
  const user = useUser();
  const pathname = usePathname();
  const params = useSearchParams();
  const [leagues, setLeagues] = useState<League[] | null>(null);
  const [tables, setTables] = useState<Record<string, Row[]>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [code, setCode] = useState(params.get("join") ?? "");
  const [nick, setNick] = useState("");
  const [name, setName] = useState("");

  const fetchAll = useCallback(async () => {
    const supabase = await loadClient();
    const { data } = await supabase.from("leagues").select("id, name, invite_code, owner_id, is_public").order("created_at");
    const list = (data ?? []) as League[];
    const entries = await Promise.all(
      list.map(async (l) => [l.id, ((await supabase.rpc("league_standings", { p_league_id: l.id, p_since: seasonStart })).data ?? []) as Row[]] as const),
    );
    return { list, tables: Object.fromEntries(entries) };
  }, [seasonStart]);

  const refresh = useCallback(async () => {
    const r = await fetchAll();
    setLeagues(r.list);
    setTables(r.tables);
  }, [fetchAll]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const r = await fetchAll();
      if (cancelled) return;
      setLeagues(r.list);
      setTables(r.tables);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, fetchAll]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const supabase = await loadClient();
    const { data, error } = await supabase.rpc("create_league", { p_name: name, p_nickname: nick });
    if (error) return setMessage(errorText(error.message));
    setName("");
    setMessage(`League created. Invite code: ${data}`);
    void refresh();
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    const supabase = await loadClient();
    const { error } = await supabase.rpc("join_league", { p_code: code, p_nickname: nick });
    if (error) return setMessage(errorText(error.message));
    setCode("");
    setMessage("You’re in.");
    void refresh();
  }

  async function setPublic(l: League, value: boolean) {
    const supabase = await loadClient();
    const { error } = await supabase.rpc("set_league_public", { p_league_id: l.id, p_public: value });
    if (error) return setMessage(errorText(error.message));
    setMessage(value ? `“${l.name}” is listed in the public directory.` : `“${l.name}” is private again.`);
    void refresh();
  }

  async function leave(l: League) {
    const supabase = await loadClient();
    const mine = l.owner_id === user?.id;
    if (!window.confirm(mine ? `Delete “${l.name}” for everyone?` : `Leave “${l.name}”?`)) return;
    const { error } = mine ? await supabase.from("leagues").delete().eq("id", l.id) : await supabase.from("league_members").delete().eq("league_id", l.id).eq("user_id", user!.id);
    if (error) return setMessage(errorText(error.message));
    void refresh();
  }

  if (user === undefined) return null;
  if (!user) {
    return (
      <div className="space-y-6">
        <p className="rounded-xl border border-border bg-surface p-4 text-sm">
          <button type="button" onClick={() => signInWithGoogle(`${pathname}${code ? `?join=${encodeURIComponent(code)}` : ""}`)} className="font-medium text-accent hover:underline">
            Sign in with Google
          </button>{" "}
          to create or join a league{code ? ` (code ${code})` : ""}.
        </p>
        <Directory leagues={directory} onJoin={(c) => signInWithGoogle(`${pathname}?join=${encodeURIComponent(c)}`)} />
        <SampleLeague rows={sample} />
      </div>
    );
  }

  const input = "mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5";
  return (
    <div className="space-y-6">
      {message && (
        <p role="status" className="rounded-lg border border-border bg-surface-muted px-3 py-2 text-sm">
          {message}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <form onSubmit={join} className="space-y-2 rounded-xl border border-border bg-surface p-4 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Join a league</h2>
          <label className="block">
            <span className="text-xs text-muted">Invite code</span>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required maxLength={12} className={`${input} font-mono`} />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Your nickname there</span>
            <input value={nick} onChange={(e) => setNick(e.target.value)} required maxLength={24} className={input} />
          </label>
          <button type="submit" className="rounded-lg border border-accent bg-accent px-3 py-1.5 font-medium text-background">
            Join
          </button>
        </form>
        <form onSubmit={create} className="space-y-2 rounded-xl border border-border bg-surface p-4 text-sm">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">Start a league</h2>
          <label className="block">
            <span className="text-xs text-muted">League name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={40} className={input} />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Your nickname there</span>
            <input value={nick} onChange={(e) => setNick(e.target.value)} required maxLength={24} className={input} />
          </label>
          <button type="submit" className="rounded-lg border border-accent bg-accent px-3 py-1.5 font-medium text-background">
            Create
          </button>
        </form>
      </div>
      <p className="text-xs text-muted">Nicknames: {NICK_HELP} League members see each other’s nicknames and records, nothing else.</p>

      <Directory
        leagues={directory.filter((d) => !leagues?.some((l) => l.invite_code === d.invite_code))}
        onJoin={(c) => {
          setCode(c);
          setMessage(`Code ${c} filled in: choose your nickname and press Join.`);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />

      {leagues?.length === 0 && (
        <>
          <p className="text-sm text-muted">You’re not in any leagues yet. Here’s what one looks like:</p>
          <SampleLeague rows={sample} />
        </>
      )}
      {leagues?.map((l) => (
        <section key={l.id} aria-label={l.name} className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">{l.name}</h2>
            <span className="text-xs text-muted">
              Invite code <span className="font-mono text-foreground">{l.invite_code}</span> ·{" "}
              <button
                type="button"
                className="text-accent hover:underline"
                onClick={() => {
                  void navigator.clipboard?.writeText(`${window.location.origin}/leagues?join=${l.invite_code}`);
                  setMessage("Invite link copied.");
                }}
              >
                Copy invite link
              </button>{" "}
              ·{" "}
              {l.owner_id === user.id && (
                <>
                  <button type="button" className="hover:text-foreground hover:underline" onClick={() => setPublic(l, !l.is_public)}>
                    {l.is_public ? "Make private" : "List publicly"}
                  </button>{" "}
                  ·{" "}
                </>
              )}
              <button type="button" className="hover:text-foreground hover:underline" onClick={() => leave(l)}>
                {l.owner_id === user.id ? "Delete league" : "Leave"}
              </button>
            </span>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-surface">
            <table className="w-full text-sm">
              <caption className="sr-only">{l.name} standings this season</caption>
              <thead className="border-b border-border text-left text-xs text-muted">
                <tr>
                  <th scope="col" className="w-10 px-3 py-2 text-right font-medium">
                    #
                  </th>
                  <th scope="col" className="w-full px-2 py-2 font-medium">
                    Member
                  </th>
                  <th scope="col" className="whitespace-nowrap px-2 py-2 text-right font-medium">
                    Pick’em
                  </th>
                  <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">
                    Brackets
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {(tables[l.id] ?? []).map((r, i) => (
                  <tr key={r.nickname} className={r.is_me ? "font-medium" : ""}>
                    <td className="px-3 py-2 text-right tabular-nums">{i + 1}</td>
                    <td className="max-w-0 truncate px-2 py-2">{r.nickname}</td>
                    <td className="px-2 py-2 text-right tabular-nums">
                      {r.correct}/{r.settled}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.bracket_points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

/** Four bots with fixed strategies, scored on this season's real results: what a league looks like. */
function SampleLeague({ rows }: { rows: SampleRow[] }) {
  if (rows.length === 0 || rows[0].settled === 0) return null;
  return (
    <section aria-labelledby="sample-heading" className="space-y-2">
      <div>
        <h2 id="sample-heading" className="text-base font-semibold">
          Sample league: the bots
        </h2>
        <p className="text-sm text-muted">
          Four bots with simple strategies, scored on every result this season that our model predicted. Can you beat Fran?
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <table className="w-full text-sm">
          <caption className="sr-only">Sample league standings this season</caption>
          <thead className="border-b border-border text-left text-xs text-muted">
            <tr>
              <th scope="col" className="w-10 px-3 py-2 text-right font-medium">
                #
              </th>
              <th scope="col" className="w-full px-2 py-2 font-medium">
                Member
              </th>
              <th scope="col" className="whitespace-nowrap px-2 py-2 text-right font-medium">
                Pick’em
              </th>
              <th scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium">
                Right
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={r.nickname}>
                <td className="px-3 py-2 text-right tabular-nums">{i + 1}</td>
                <td className="max-w-0 px-2 py-2">
                  <span className="block truncate">{r.nickname}</span>
                  <span className="block truncate text-xs text-muted">{r.strategy}</span>
                </td>
                <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">
                  {r.correct.toLocaleString("en-US")}/{r.settled.toLocaleString("en-US")}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{Math.round((100 * r.correct) / r.settled)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Leagues their owners chose to list; anyone can join with the code. */
function Directory({ leagues, onJoin }: { leagues: PublicLeague[]; onJoin: (code: string) => void }) {
  if (leagues.length === 0) return null;
  return (
    <section aria-labelledby="directory-heading" className="space-y-2">
      <h2 id="directory-heading" className="text-base font-semibold">
        Public leagues
      </h2>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface text-sm">
        {leagues.map((l) => (
          <li key={l.invite_code} className="flex items-center gap-3 px-4 py-2.5">
            <span className="min-w-0 flex-1 truncate font-medium">{l.name}</span>
            <span className="shrink-0 text-xs text-muted tabular-nums">
              {l.members} {l.members === 1 ? "member" : "members"}
            </span>
            <button type="button" onClick={() => onJoin(l.invite_code)} className="shrink-0 rounded-lg border border-accent px-3 py-1 text-xs font-medium text-accent hover:bg-accent-soft">
              Join
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
