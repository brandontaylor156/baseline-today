import { ImageResponse } from "next/og";

import { OG_COLORS, OG_SIZE, OgFrame, OgStat } from "@/components/og/card";
import { getRivals } from "@/lib/data/rivals";
import { getPlayer } from "@/lib/data/tennis";

export const alt = "Record against every opponent";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = /^\d+$/.test(id) ? await getPlayer(Number(id)) : null;
  const rivals = player ? await getRivals(player.id) : null;
  const total = (rivals?.rivals ?? []).reduce((t, r) => [t[0] + r.wins, t[1] + r.losses], [0, 0]);
  return new ImageResponse(
    (
      <OgFrame>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontSize: 64, fontWeight: 700 }}>{player ? `${player.fullName} vs everyone` : "Rivals"}</div>
          {rivals && (
            <div style={{ display: "flex", gap: 20 }}>
              <OgStat label="Since 2015" value={`${total[0]}–${total[1]}`} />
              <OgStat label="vs top 10" value={`${rivals.vsTop10[0]}–${rivals.vsTop10[1]}`} />
              <OgStat label="Opponents" value={String(rivals.rivals.length)} />
            </div>
          )}
          <div style={{ fontSize: 26, color: OG_COLORS.MUTED }}>Head-to-head records by surface</div>
        </div>
      </OgFrame>
    ),
    size,
  );
}
