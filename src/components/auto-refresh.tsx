"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

const INTERVAL_MS = 60_000;

function subscribeClock(onChange: () => void) {
  const id = setInterval(onChange, 15_000);
  return () => clearInterval(id);
}

/**
 * Re-renders the page every 60 seconds while it is visible (and right away when the tab becomes
 * visible again). Each re-render also lets the server refresh stale data in the background.
 */
export function AutoRefresh({ refreshedAt }: { refreshedAt: string | null }) {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      clearInterval(timer);
      timer = setInterval(() => router.refresh(), INTERVAL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        start();
      } else {
        clearInterval(timer);
      }
    };
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router]);

  const label = useSyncExternalStore(
    subscribeClock,
    () => (refreshedAt ? ago(Date.now() - Date.parse(refreshedAt)) : "not yet updated"),
    () => (refreshedAt ? "updated recently" : "not yet updated"),
  );

  return (
    <p className="text-xs text-muted" aria-live="polite">
      Updates automatically · {label}
    </p>
  );
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return "updated just now";
  const m = Math.round(s / 60);
  if (m < 60) return `updated ${m} min ago`;
  return `updated ${Math.round(m / 60)} h ago`;
}
