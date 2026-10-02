import type { Metadata } from "next";

export const metadata: Metadata = { title: "Credits" };

export default function CreditsPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Credits</h1>
      <p className="text-muted">
        Rankings and player data from BALLDONTLIE. This site is not affiliated with or endorsed by the ATP or WTA.
      </p>
      <p className="text-muted">Player photo credits will be listed here.</p>
    </section>
  );
}
