import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RankingsView } from "@/components/rankings-view";
import { isTour, TOUR_LABEL } from "@/lib/format";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({ params }: PageProps<"/rankings/[tour]">): Promise<Metadata> {
  const { tour } = await params;
  return isTour(tour) ? { title: `${TOUR_LABEL[tour]} rankings` } : {};
}

export default async function RankingsPage({ params, searchParams }: PageProps<"/rankings/[tour]">) {
  const { tour } = await params;
  if (!isTour(tour)) notFound();

  const { date } = await searchParams;
  const value = typeof date === "string" && DATE.test(date) ? date : undefined;
  return <RankingsView tour={tour} date={value} />;
}
