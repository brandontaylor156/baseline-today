import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import { getPlayer, type PlayerDetail } from "@/lib/data/tennis";
import { h2hPath, parseH2H } from "@/lib/slug";

import { H2HContent, h2hMetadata } from "../h2h-content";

export const revalidate = 3600;

async function load(pair: string): Promise<[PlayerDetail, PlayerDetail] | null> {
  const ids = parseH2H(pair);
  if (!ids) return null;
  const [a, b] = await Promise.all([getPlayer(ids.a), getPlayer(ids.b)]);
  return a && b && a.tour === b.tour ? [a, b] : null;
}

export async function generateMetadata({ params }: PageProps<"/h2h/[pair]">): Promise<Metadata> {
  const players = await load((await params).pair);
  return players ? h2hMetadata(...players) : { title: "Head-to-head" };
}

// Canonical head-to-head page: /h2h/jannik-sinner-vs-carlos-alcaraz-<id>-<id>.
export default async function H2HPairPage({ params }: PageProps<"/h2h/[pair]">) {
  const { pair } = await params;
  const players = await load(pair);
  if (!players) notFound();
  const [a, b] = players;
  const canonical = h2hPath({ id: a.id, name: a.fullName }, { id: b.id, name: b.fullName });
  if (`/h2h/${pair}` !== canonical) permanentRedirect(canonical);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {a.fullName} vs {b.fullName}
        </h1>
        <p className="text-sm text-muted">Head-to-head: every meeting in the tracked draws since 2015, and our model’s chances today.</p>
      </div>
      <H2HContent a={a} b={b} />
    </div>
  );
}
