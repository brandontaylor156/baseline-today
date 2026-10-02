"use client";

import { useEffect, useState } from "react";

export interface SessionUser {
  id: string;
  name: string | null;
  avatarUrl: string | null;
}

/**
 * The Supabase client (~70 KB) loads only when it's needed: a visitor with a session cookie, or
 * someone who clicks Sign in / Sign out / favorite. Most visitors never download it.
 */
export function loadClient() {
  return import("@/lib/supabase/client").then((m) => m.createClient());
}

/** @supabase/ssr stores the session in "sb-<project>-auth-token" cookies. */
function hasSessionCookie(): boolean {
  return document.cookie.split(";").some((c) => c.trim().startsWith("sb-"));
}

/** Signed-in user for client islands on otherwise static pages. `undefined` while loading. */
export function useUser(): SessionUser | null | undefined {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);

  useEffect(() => {
    if (!hasSessionCookie()) {
      // No session: answer right away without loading the auth library.
      queueMicrotask(() => setUser(null));
      return;
    }
    let unsubscribe = () => {};
    let cancelled = false;
    loadClient().then((supabase) => {
      if (cancelled) return;
      // onAuthStateChange fires INITIAL_SESSION right away, so this also covers the first load.
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        const u = session?.user;
        setUser(
          u
            ? {
                id: u.id,
                name: (u.user_metadata.full_name as string | undefined) ?? (u.user_metadata.name as string | undefined) ?? null,
                avatarUrl: (u.user_metadata.avatar_url as string | undefined) ?? null,
              }
            : null,
        );
      });
      unsubscribe = () => data.subscription.unsubscribe();
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return user;
}

export async function signInWithGoogle(next: string) {
  const supabase = await loadClient();
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
}
