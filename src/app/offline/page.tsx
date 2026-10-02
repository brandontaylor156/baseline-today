import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline", robots: { index: false } };

// Shown by the service worker when a page can't load without a connection.
export default function OfflinePage() {
  return (
    <section className="mx-auto max-w-md space-y-3 py-12 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">You’re offline</h1>
      <p className="text-muted">Baseline Today needs a connection for rankings and results. Check your network and try again.</p>
      {/* A full page load on purpose: it retries the network instead of a cached client route. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-background">
        Try again
      </a>
    </section>
  );
}
