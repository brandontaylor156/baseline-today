import { ImageResponse } from "next/og";

import { OG_COLORS, OG_SIZE, OgFrame } from "@/components/og/card";
import { getHeadToHead } from "@/lib/data/h2h";
import { predictPair } from "@/lib/data/predictions";
import { getPlayer, type PlayerDetail } from "@/lib/data/tennis";
import { initials, TOUR_LABEL } from "@/lib/format";
import { thumbUrl } from "@/lib/photos/thumb";

const id = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null);

function Face({ player }: { player: PlayerDetail }) {
  return player.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbUrl(player.image.imageUrl, 330)}
      width={200}
      height={200}
      alt=""
      style={{ borderRadius: 100, objectFit: "cover", objectPosition: "top" }}
    />
  ) : (
    <div
      style={{
        width: 200,
        height: 200,
        borderRadius: 100,
        background: "#173326",
        color: OG_COLORS.ACCENT,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 76,
        fontWeight: 700,
      }}
    >
      {initials(player.fullName)}
    </div>
  );
}

function Player({ player, chance }: { player: PlayerDetail; chance: number | null }) {
  const rank = player.history.at(-1)?.rank;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, width: 380 }}>
      <Face player={player} />
      <div style={{ fontSize: 44, fontWeight: 700, textAlign: "center", lineHeight: 1.05 }}>{player.fullName}</div>
      <div style={{ fontSize: 26, color: OG_COLORS.MUTED }}>{rank ? `#${rank} ${TOUR_LABEL[player.tour]}` : TOUR_LABEL[player.tour]}</div>
      {chance !== null && <div style={{ fontSize: 64, fontWeight: 700, color: OG_COLORS.ACCENT }}>{`${Math.round(chance * 100)}%`}</div>}
    </div>
  );
}

// Share card for /h2h?a=…&b=…: both players, the head-to-head record and the model's chance today.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const [a, b] = await Promise.all([id(url.searchParams.get("a")), id(url.searchParams.get("b"))].map((x) => (x ? getPlayer(x) : null)));
  const headers = { "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" };

  if (!a || !b || a.tour !== b.tour || a.id === b.id) {
    return new ImageResponse(
      (
        <OgFrame>
          <div style={{ fontSize: 64, fontWeight: 700 }}>Head-to-head</div>
        </OgFrame>
      ),
      { ...OG_SIZE, headers },
    );
  }

  const [h2h, model] = await Promise.all([getHeadToHead(a.id, b.id), predictPair(a.tour, a.id, b.id, null)]);
  const p = model?.p ?? null;

  return new ImageResponse(
    (
      <OgFrame>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
          <Player player={a} chance={p} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ fontSize: 28, color: OG_COLORS.MUTED }}>Head-to-head</div>
            <div style={{ fontSize: 96, fontWeight: 700 }}>{`${h2h.winsA}–${h2h.winsB}`}</div>
            {/* Level with the percentages it labels. */}
            {p !== null && <div style={{ fontSize: 24, color: OG_COLORS.MUTED, marginTop: 64 }}>← Win chance today →</div>}
          </div>
          <Player player={b} chance={p === null ? null : 1 - p} />
        </div>
      </OgFrame>
    ),
    { ...OG_SIZE, headers },
  );
}
