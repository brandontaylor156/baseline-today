import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { WatchParty } from "@/components/party/watch-party";

export const metadata: Metadata = { title: "Watch party", robots: { index: false } };

export default async function PartyPage({ params }: PageProps<"/party/[code]">) {
  const { code } = await params;
  if (!/^[A-Za-z0-9]{8}$/.test(code)) notFound();
  return <WatchParty code={code} />;
}
