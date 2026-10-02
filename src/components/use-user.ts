"use client";

import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

export interface SessionUser {
  id: string;
  name: string | null;
  avatarUrl: string | null;
}

/** Signed-in user for client islands on otherwise static pages. `undefined` while loading. */
export function useUser(): SessionUser | null | undefined {
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
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
    return () => data.subscription.unsubscribe();
  }, []);

  return user;
}

export async function signInWithGoogle(next: string) {
  const supabase = createClient();
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
}
