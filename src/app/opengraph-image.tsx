import { ImageResponse } from "next/og";

import { OG_COLORS, OG_SIZE, OgFrame } from "@/components/og/card";

export const alt = "Baseline Today: ATP and WTA rankings, results and player profiles";
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <OgFrame>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1.05 }}>ATP and WTA rankings, results and player records</div>
          <div style={{ fontSize: 32, color: OG_COLORS.MUTED }}>Weekly top 100 · results · season records · rank history</div>
        </div>
      </OgFrame>
    ),
    size,
  );
}
