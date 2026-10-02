import { RankingsView } from "@/components/rankings-view";

export const revalidate = 3600;

export default function Home() {
  return <RankingsView tour="atp" />;
}
