"use client";

import { signInWithGoogle } from "./use-user";

export function SignInPrompt({ next }: { next: string }) {
  return (
    <section className="mx-auto max-w-sm py-12 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Follow your players</h1>
      <p className="mt-2 text-muted">Sign in to keep a list of favorites and see where they stand each week.</p>
      <button
        type="button"
        onClick={() => signInWithGoogle(next)}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background"
      >
        Sign in with Google
      </button>
      <p className="mt-3 text-xs text-muted">Sign-in keeps your Google name and email; we store only your favorites on top. No passwords.</p>
    </section>
  );
}
