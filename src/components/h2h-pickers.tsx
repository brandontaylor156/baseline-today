"use client";

import { useRouter } from "next/navigation";

import type { Tour } from "@/lib/provider/types";

import { PlayerPicker } from "./player-picker";

/** Chooses the missing player(s) and navigates to /h2h?a=…&b=…. */
export function H2HPickers({ a, tour }: { a: number | null; tour: Tour | null }) {
  const router = useRouter();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {a === null ? (
        <PlayerPicker label="First player" onPick={(p) => router.push(`/h2h?a=${p.id}`)} />
      ) : (
        <PlayerPicker label="Compare with" tour={tour ?? undefined} onPick={(p) => router.push(`/h2h?a=${a}&b=${p.id}`)} />
      )}
    </div>
  );
}
