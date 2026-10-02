// Parsing for ESPN's public scoreboard, used ONLY as a timing reference while measuring the
// provider's live-score lag during the trial. Never displayed on the site.

import type { Tour } from "@/lib/provider/types";
import { orientedGamesState, playersKey } from "@/lib/sync/match-rows";

interface EspnLinescore {
  value?: number;
}
interface EspnCompetitor {
  athlete?: { displayName?: string };
  linescores?: EspnLinescore[];
}
interface EspnCompetition {
  id?: string;
  status?: { type?: { state?: string; name?: string } };
  competitors?: EspnCompetitor[];
}
export interface EspnScoreboard {
  events?: { groupings?: { grouping?: { displayName?: string }; competitions?: EspnCompetition[] }[] }[];
}

export interface EspnLiveMatch {
  matchKey: string;
  playersKey: string;
  gamesState: string;
  status: string;
}

// Combined events (e.g. the China Open) list men's and women's draws in both tours' feeds,
// so filter by grouping name. Exact match: "Women's Singles" contains "men's singles".
const SINGLES: Record<Tour, RegExp> = { atp: /^men's singles$/i, wta: /^women's singles$/i };

/** Live singles matches of one tour, with games per set oriented like the provider's observations. */
export function parseEspnLive(board: EspnScoreboard, tour: Tour): EspnLiveMatch[] {
  const out: EspnLiveMatch[] = [];
  for (const event of board.events ?? []) {
    for (const group of event.groupings ?? []) {
      if (!SINGLES[tour].test(group.grouping?.displayName?.trim() ?? "")) continue;
      for (const c of group.competitions ?? []) {
        if (c.status?.type?.state !== "in" || !c.id) continue;
        const [a, b] = c.competitors ?? [];
        const nameA = a?.athlete?.displayName;
        const nameB = b?.athlete?.displayName;
        if (!nameA || !nameB) continue;
        const setsCount = Math.max(a.linescores?.length ?? 0, b.linescores?.length ?? 0);
        const sets = Array.from({ length: setsCount }, (_, i) => ({
          p1: a.linescores?.[i]?.value ?? null,
          p2: b.linescores?.[i]?.value ?? null,
        }));
        const { key, flipped } = playersKey(nameA, nameB);
        out.push({ matchKey: c.id, playersKey: key, gamesState: orientedGamesState(sets, flipped), status: "in_progress" });
      }
    }
  }
  return out;
}
