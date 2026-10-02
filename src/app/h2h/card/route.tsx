import { ImageResponse } from "next/og";

import { OgFrame, OG_SIZE } from "@/components/og/card";
import { MatchupCard } from "@/components/og/matchup";
import { getHeadToHead } from "@/lib/data/h2h";
import { predictPair } from "@/lib/data/predictions";
import { getPlayer } from "@/lib/data/tennis";
import { TOUR_LABEL } from "@/lib/format";

const id = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null);

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
  const detail = (pl: typeof a) => {
    const rank = pl.history.at(-1)?.rank;
    return rank ? `#${rank} ${TOUR_LABEL[pl.tour]}` : TOUR_LABEL[pl.tour];
  };

  return new ImageResponse(
    (
      <MatchupCard
        a={{ name: a.fullName, image: a.image, detail: detail(a), chance: p }}
        b={{ name: b.fullName, image: b.image, detail: detail(b), chance: p === null ? null : 1 - p }}
        label="Head-to-head"
        value={`${h2h.winsA}–${h2h.winsB}`}
        chanceLabel="Win chance today"
      />
    ),
    { ...OG_SIZE, headers },
  );
}
