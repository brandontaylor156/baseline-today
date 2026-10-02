import { ImageResponse } from "next/og";

import { OG_COLORS, OG_SIZE, OgFrame, OgStat } from "@/components/og/card";
import { getPlayerResults } from "@/lib/data/results";
import { getPlayer } from "@/lib/data/tennis";
import { formatPoints, initials, TOUR_LABEL } from "@/lib/format";
import { thumbUrl } from "@/lib/photos/thumb";

export const alt = "Player profile on Baseline Today";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const player = /^\d+$/.test(id) ? await getPlayer(Number(id)) : null;

  if (!player) {
    return new ImageResponse(
      (
        <OgFrame>
          <div style={{ fontSize: 64, fontWeight: 700 }}>Player not found</div>
        </OgFrame>
      ),
      size,
    );
  }

  const results = await getPlayerResults(player.id);
  const latest = player.history.at(-1);
  const record = results.wins + results.losses > 0 ? `${results.wins}–${results.losses}` : "–";

  return new ImageResponse(
    (
      <OgFrame>
        <div style={{ display: "flex", alignItems: "center", gap: 56 }}>
          {player.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={thumbUrl(player.image.imageUrl, 330)}
              width={300}
              height={300}
              alt=""
              style={{ borderRadius: 150, objectFit: "cover", objectPosition: "top" }}
            />
          ) : (
            <div
              style={{
                width: 300,
                height: 300,
                borderRadius: 150,
                background: "#173326",
                color: OG_COLORS.ACCENT,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 110,
                fontWeight: 700,
              }}
            >
              {initials(player.fullName)}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ fontSize: 30, color: OG_COLORS.ACCENT, fontWeight: 700 }}>
              {`${TOUR_LABEL[player.tour]}${player.countryCode ? ` · ${player.countryCode}` : ""}`}
            </div>
            <div style={{ fontSize: 76, fontWeight: 700, lineHeight: 1 }}>{player.fullName}</div>
            <div style={{ display: "flex", gap: 18, marginTop: 10 }}>
              <OgStat label="Rank" value={latest ? `#${latest.rank}` : "–"} />
              <OgStat label="Points" value={formatPoints(latest?.points ?? null)} />
              <OgStat label={`${results.season} record`} value={record} />
            </div>
          </div>
        </div>
      </OgFrame>
    ),
    size,
  );
}
