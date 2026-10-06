import { ImageResponse } from "next/og";

import { OG_COLORS, OG_SIZE, OgFrame, OgStat } from "@/components/og/card";
import { getModelAccuracy } from "@/lib/data/insights";

export const alt = "How accurate our tennis prediction model is";
export const size = OG_SIZE;
export const contentType = "image/png";
export const revalidate = 3600;

export default async function Image() {
  const rows = await getModelAccuracy();
  const latest = Math.max(...rows.map((r) => r.season));
  const now = rows.filter((r) => r.season === latest);
  const since = rows.filter((r) => r.season >= 2025);
  const s = (xs: typeof rows, f: (r: (typeof rows)[number]) => number) => xs.reduce((n, r) => n + f(r), 0);
  const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "–");
  return new ImageResponse(
    (
      <OgFrame>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontSize: 68, fontWeight: 700 }}>How accurate is the model?</div>
          <div style={{ display: "flex", gap: 20 }}>
            <OgStat label={`${latest} accuracy`} value={pct(s(now, (r) => r.correct), s(now, (r) => r.matches))} />
            <OgStat label="Model, top-100 matches" value={pct(s(since, (r) => r.rankedModelCorrect), s(since, (r) => r.ranked))} />
            <OgStat label="Higher rank wins" value={pct(s(since, (r) => r.rankedRankCorrect), s(since, (r) => r.ranked))} />
          </div>
          <div style={{ fontSize: 26, color: OG_COLORS.MUTED }}>Season by season since 2016, by tour and surface</div>
        </div>
      </OgFrame>
    ),
    size,
  );
}
