import type { Metadata } from "next";

import { calendarSections, displayName, getSeasonTournaments } from "@/lib/data/tournaments";
import { SITE_URL } from "@/lib/site";

export const metadata: Metadata = {
  title: "Widgets",
  description: "Free embeddable ATP and WTA rankings and title-chance widgets for your site.",
};
export const revalidate = 3600;

function Snippet({ title, path, height }: { title: string; path: string; height: number }) {
  const code = `<iframe src="${SITE_URL}${path}" title="${title}" width="320" height="${height}" style="border:0" loading="lazy"></iframe>`;
  return (
    <section className="space-y-2 rounded-xl border border-border bg-surface p-4">
      <h2 className="font-semibold">{title}</h2>
      <iframe src={path} title={title} width={320} height={height} className="max-w-full border-0" loading="lazy" />
      <label className="block text-xs text-muted">
        Copy this code into your page
        <textarea readOnly value={code} rows={3} className="mt-1 w-full rounded-lg border border-border bg-background p-2 font-mono text-xs" />
      </label>
    </section>
  );
}

export default async function WidgetsPage() {
  const now = new Date();
  const tournaments = await getSeasonTournaments(now.getUTCFullYear());
  const live = calendarSections(tournaments, now.toISOString().slice(0, 10)).now.filter((t) => !t.champion).slice(0, 2);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Widgets</h1>
        <p className="text-sm text-muted">
          Free to embed on your blog or club site. They update by themselves, follow your visitors’ light or dark setting and link
          back here.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Snippet title="ATP top 10" path="/embed/rankings/atp" height={380} />
        <Snippet title="WTA top 10" path="/embed/rankings/wta" height={380} />
        {live.map((t) => (
          <Snippet key={t.id} title={`${displayName(t.name)} title chances`} path={`/embed/title/${t.id}`} height={340} />
        ))}
      </div>
      <p className="text-xs text-muted">
        For another tournament, use <code className="font-mono">/embed/title/&lt;id&gt;</code> with the number from its page address.
      </p>
    </div>
  );
}
