import { ImageResponse } from "next/og";

import { OG_COLORS, OG_SIZE, OgFrame } from "@/components/og/card";
import { displayName } from "@/lib/data/tournaments";
import { getWeekRecap } from "@/lib/data/weekly";
import { isMonday, weekLabel } from "@/lib/weeks";

export const alt = "Week in tennis: champions, upsets and ranking movers";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ monday: string }> }) {
  const { monday } = await params;
  const recap = isMonday(monday) ? await getWeekRecap(monday) : null;
  const champs = (recap?.champions ?? []).filter((c) => c.tournament.champion).slice(0, 4);
  return new ImageResponse(
    (
      <OgFrame>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 30, color: OG_COLORS.ACCENT }}>Week in tennis</div>
          <div style={{ fontSize: 60, fontWeight: 700 }}>{isMonday(monday) ? weekLabel(monday) : "Weekly recap"}</div>
          {champs.map((c) => (
            <div key={c.tournament.id} style={{ display: "flex", fontSize: 32 }}>
              🏆 {c.tournament.champion!.name}
              <span style={{ color: OG_COLORS.MUTED, marginLeft: 14 }}>{displayName(c.tournament.name)}</span>
            </div>
          ))}
        </div>
      </OgFrame>
    ),
    size,
  );
}
