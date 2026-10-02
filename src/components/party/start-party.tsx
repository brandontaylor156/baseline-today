"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import { loadClient, signInWithGoogle, useUser } from "../use-user";

/** "Start a watch party" on a match page: pick a nickname, get a private room and invite link. */
export function StartParty({ matchId }: { matchId: number }) {
  const user = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [nick, setNick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = await loadClient();
    const { data, error } = await supabase.rpc("create_party", { p_match_id: matchId, p_nickname: nick.trim() });
    setBusy(false);
    if (error) {
      setError(/limit/i.test(error.message) ? "You can start up to 5 parties a day." : "Nicknames: 2–24 letters, numbers, spaces, dots, dashes or underscores.");
      return;
    }
    router.push(`/party/${data}`);
  }

  if (user === undefined) return null;
  return (
    <section aria-labelledby="party-heading" className="rounded-xl border border-accent/50 bg-accent-soft p-4">
      <h2 id="party-heading" className="font-semibold">
        Watch it together
      </h2>
      <p className="text-sm text-muted">
        Start a private watch party: invite friends, chat, react, call each set and follow the win chance point by point.
      </p>
      {!user ? (
        <button type="button" onClick={() => signInWithGoogle(pathname)} className="mt-3 rounded-lg border border-accent bg-accent px-3 py-1.5 text-sm font-medium text-background">
          Sign in to start a party
        </button>
      ) : !open ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-3 rounded-lg border border-accent bg-accent px-3 py-1.5 text-sm font-medium text-background">
          Start a watch party
        </button>
      ) : (
        <form onSubmit={start} className="mt-3 flex flex-wrap items-end gap-2 text-sm">
          <label className="min-w-0 flex-1 basis-48">
            <span className="block text-xs text-muted">Your nickname in the room</span>
            <input value={nick} onChange={(e) => setNick(e.target.value)} required maxLength={24} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-1.5" />
          </label>
          <button type="submit" disabled={busy} className="rounded-lg border border-accent bg-accent px-3 py-1.5 font-medium text-background disabled:opacity-60">
            {busy ? "Starting…" : "Start"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
