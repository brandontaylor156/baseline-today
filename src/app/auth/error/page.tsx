import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Sign-in failed" };

export default function AuthErrorPage() {
  return (
    <section className="py-16 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Sign-in didn’t finish</h1>
      <p className="mt-2 text-muted">The Google sign-in was cancelled or expired. Please try again.</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background">
        Back to rankings
      </Link>
    </section>
  );
}
