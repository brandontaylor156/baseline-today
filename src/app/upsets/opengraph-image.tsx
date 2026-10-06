import { ImageResponse } from "next/og";

import { OG_COLORS, OG_SIZE, OgFrame, OgStat } from "@/components/og/card";
import { getUpsetRates } from "@/lib/data/insights";

export const alt = "How often favorites lose in tennis";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 3600;

export default async function Image() {
  const r = await getUpsetRates();
  const pct = (x: { upsets: number; matches: number } | null | undefined) => (x && x.matches ? `${Math.round((100 * x.upsets) / x.matches)}%` : "–");
  return new ImageResponse(
    (
      <OgFrame>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontSize: 68, fontWeight: 700 }}>How often favorites lose</div>
          <div style={{ display: "flex", gap: 20 }}>
            <OgStat label="Since 2016" value={pct(r.all)} />
            {r.surface.slice(0, 3).map((s) => (
              <OgStat key={s.key} label={s.key} value={pct(s)} />
            ))}
          </div>
          <div style={{ fontSize: 26, color: OG_COLORS.MUTED }}>ATP and WTA, by round, surface and season</div>
        </div>
      </OgFrame>
    ),
    size,
  );
}
