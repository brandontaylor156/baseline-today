import type { Metadata } from "next";
import Link from "next/link";

import { Flag } from "@/components/flag";
import { getCountries } from "@/lib/data/countries";

export const metadata: Metadata = { title: "Countries", description: "Tennis nations by players in the ATP and WTA top 100." };
export const revalidate = 3600;

export default async function CountriesPage() {
  const countries = await getCountries();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Countries</h1>
        <p className="text-sm text-muted">Nations with players in this week’s ATP and WTA top 100.</p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {countries.map((c) => (
          <li key={c.code}>
            <Link href={`/countries/${c.code}`} className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 hover:bg-surface-muted">
              <Flag code={c.code} reserve className="text-xl" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{c.code}</span>
                <span className="block truncate text-xs text-muted">
                  {[c.best.atp && `${c.best.atp.name} #${c.best.atp.rank}`, c.best.wta && `${c.best.wta.name} #${c.best.wta.rank}`].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 text-right text-xs tabular-nums text-muted">
                <span className="block">ATP {c.players.atp}</span>
                <span className="block">WTA {c.players.wta}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
