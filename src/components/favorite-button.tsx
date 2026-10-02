"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { loadClient, signInWithGoogle, useUser } from "./use-user";

/**
 * Favorite toggle on a cached player page. Reads and writes the user's own favorites row
 * directly; RLS guarantees a user can only see or change their own.
 */
export function FavoriteButton({ playerId, initialCount }: { playerId: number; initialCount: number }) {
  const user = useUser();
  const pathname = usePathname();
  const [favorited, setFavorited] = useState<boolean | null>(null);
  const [count, setCount] = useState(initialCount);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    loadClient()
      .then((supabase) => supabase.from("favorites").select("player_id").eq("player_id", playerId).maybeSingle())
      .then(({ data }) => {
        if (!cancelled) setFavorited(Boolean(data));
      });
    return () => {
      cancelled = true;
    };
  }, [user, playerId]);

  async function toggle() {
    if (!user) return signInWithGoogle(pathname);
    if (favorited === null || busy) return;
    setBusy(true);
    const supabase = await loadClient();
    const { error } = favorited
      ? await supabase.from("favorites").delete().eq("player_id", playerId)
      : await supabase.from("favorites").insert({ player_id: playerId });
    if (!error) {
      setCount((c) => Math.max(0, c + (favorited ? -1 : 1)));
      setFavorited(!favorited);
    }
    setBusy(false);
  }

  const on = Boolean(user) && favorited === true;
  const label = !user ? "Sign in to favorite" : on ? "Favorited" : "Add to favorites";

  return (
    <div className="flex flex-col items-center gap-1 sm:items-start">
      <button
        type="button"
        onClick={toggle}
        disabled={user === undefined || (Boolean(user) && favorited === null) || busy}
        aria-pressed={user ? on : undefined}
        className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
          on ? "border-accent bg-accent text-background" : "border-border bg-surface hover:bg-surface-muted"
        }`}
      >
        <span aria-hidden>{on ? "★" : "☆"}</span>
        {label}
      </button>
      <p className="text-sm text-muted" aria-live="polite">
        {count > 0 ? `Favorited by ${count} ${count === 1 ? "fan" : "fans"}` : "No favorites yet"}
      </p>
    </div>
  );
}
