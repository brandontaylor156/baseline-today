import type { PlayerImage } from "@/lib/data/tennis";
import { initials } from "@/lib/format";
import { thumbUrl } from "@/lib/photos/thumb";

import { OG_COLORS, OgFrame } from "./card";

export interface CardSide {
  name: string;
  image: PlayerImage | null;
  detail: string;
  chance: number | null;
}

function Face({ side }: { side: CardSide }) {
  return side.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={thumbUrl(side.image.imageUrl, 330)} width={200} height={200} alt="" style={{ borderRadius: 100, objectFit: "cover", objectPosition: "top" }} />
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
      {initials(side.name)}
    </div>
  );
}

function Player({ side }: { side: CardSide }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, width: 380 }}>
      <Face side={side} />
      <div style={{ fontSize: 44, fontWeight: 700, textAlign: "center", lineHeight: 1.05 }}>{side.name}</div>
      <div style={{ fontSize: 26, color: OG_COLORS.MUTED }}>{side.detail}</div>
      {side.chance !== null && <div style={{ fontSize: 64, fontWeight: 700, color: OG_COLORS.ACCENT }}>{`${Math.round(side.chance * 100)}%`}</div>}
    </div>
  );
}

/** Two players, a headline in the middle, and win chances lined up under each player. */
export function MatchupCard({ a, b, label, value, chanceLabel }: { a: CardSide; b: CardSide; label: string; value: string; chanceLabel: string }) {
  return (
    <OgFrame>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
        <Player side={a} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, maxWidth: 300 }}>
          <div style={{ fontSize: 28, color: OG_COLORS.MUTED, textAlign: "center" }}>{label}</div>
          <div style={{ fontSize: value.length > 7 ? 60 : 96, fontWeight: 700, textAlign: "center" }}>{value}</div>
          {/* Level with the percentages it labels. */}
          {a.chance !== null && <div style={{ fontSize: 24, color: OG_COLORS.MUTED, marginTop: 64 }}>{`← ${chanceLabel} →`}</div>}
        </div>
        <Player side={b} />
      </div>
    </OgFrame>
  );
}
