"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Match time in the viewer's own time zone. The server renders a neutral fallback. */
export function LocalTime({ iso, fallback }: { iso: string; fallback: string | null }) {
  const text = useSyncExternalStore(
    subscribe,
    () => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }),
    () => fallback ?? "Scheduled",
  );
  return <time dateTime={iso}>{text}</time>;
}
