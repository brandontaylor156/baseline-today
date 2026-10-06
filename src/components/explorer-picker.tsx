"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { PlayerPicker } from "@/components/player-picker";

/** Chooses a lab page's player (or opponent), keeping the other filters in the address. */
export function ExplorerPicker({ param, label, target = "/lab/explorer" }: { param: "p" | "o"; label: string; target?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <PlayerPicker
      label={label}
      onPick={(player) => {
        const next = new URLSearchParams(params.toString());
        next.set(param, String(player.id));
        if (param === "p") next.delete("o");
        router.push(`${target}?${next.toString()}`);
      }}
    />
  );
}
