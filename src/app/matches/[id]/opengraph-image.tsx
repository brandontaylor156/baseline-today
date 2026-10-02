import { ImageResponse } from "next/og";

import { OG_SIZE, OgFrame } from "@/components/og/card";
import { MatchupCard } from "@/components/og/matchup";
import { getMatchPreview } from "@/lib/data/match-preview";
import { getPlayer } from "@/lib/data/tennis";
import { displayName } from "@/lib/data/tournaments";

export const alt = "Match preview on Baseline Today";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = /^\d+$/.test(id) ? await getMatchPreview(Number(id)) : null;
  if (!m) {
    return new ImageResponse(
      (
        <OgFrame>
          <div style={{ fontSize: 64, fontWeight: 700 }}>Match not found</div>
        </OgFrame>
      ),
      size,
    );
  }
  const [pa, pb] = await Promise.all([m.a.id ? getPlayer(m.a.id) : null, m.b.id ? getPlayer(m.b.id) : null]);
  const detail = (rank: number | null) => (rank ? `#${rank}` : "Unranked");
  return new ImageResponse(
    (
      <MatchupCard
        a={{ name: m.a.name, image: pa?.image ?? null, detail: detail(m.a.rank), chance: m.chanceA }}
        b={{ name: m.b.name, image: pb?.image ?? null, detail: detail(m.b.rank), chance: m.chanceA === null ? null : 1 - m.chanceA }}
        label={displayName(m.match.tournament.name)}
        value={m.match.round ?? "vs"}
        chanceLabel={m.scheduled ? "Win chance" : "Chance before the match"}
      />
    ),
    size,
  );
}
