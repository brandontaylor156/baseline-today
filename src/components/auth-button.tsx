"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { loadClient, signInWithGoogle, useUser } from "./use-user";

export function AuthButton() {
  const user = useUser();
  const pathname = usePathname();
  const router = useRouter();

  if (user === undefined) return <span className="h-8 w-20" aria-hidden />;

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => signInWithGoogle(pathname)}
        className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
      >
        Sign in
      </button>
    );
  }

  async function signOut() {
    await (await loadClient()).auth.signOut();
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1 text-sm">
      <Link href="/my-players" className="rounded-md px-2.5 py-1.5 text-muted hover:bg-surface-muted hover:text-foreground">
        My players
      </Link>
      <button
        type="button"
        onClick={signOut}
        title={user.name ? `Signed in as ${user.name}` : undefined}
        className="rounded-md px-2.5 py-1.5 text-muted hover:bg-surface-muted hover:text-foreground"
      >
        Sign out
      </button>
    </div>
  );
}
