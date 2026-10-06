import type { Metadata } from "next";
import Link from "next/link";

import { DemoParty } from "@/components/party/demo-party";
import { getDemoMatch } from "@/lib/data/party-demo";

export const metadata: Metadata = {
  title: "Watch party demo",
  description:
    "Try a watch party without an account: a simulated replay built from a real result's set scores, with win chances, calls and chat.",
};

export default async function DemoPartyPage({ searchParams }: PageProps<"/party/demo">) {
  const { match } = await searchParams;
  const requested = typeof match === "string" && /^\d{1,9}$/.test(match) ? Number(match) : null;
  const demo = await getDemoMatch(requested);
  if (!demo) {
    return (
      <p className="rounded-xl border border-border bg-surface p-4 text-sm">
        {requested ? "That match can’t be replayed (it isn’t a finished, completed result)." : "No recent match to replay right now."}{" "}
        <Link href="/results" className="font-medium text-accent hover:underline">
          See recent results
        </Link>
      </p>
    );
  }
  return <DemoParty key={demo.match.id} match={demo.match} points={demo.points} seed={demo.seed} />;
}
