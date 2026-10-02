import { notFound } from "next/navigation";

import { isTour } from "@/lib/format";

// Validates the tour before loading.tsx starts streaming, so unknown tours get a real 404 status.
export default async function TourLayout({ children, params }: LayoutProps<"/rankings/[tour]">) {
  const { tour } = await params;
  if (!isTour(tour)) notFound();
  return children;
}
