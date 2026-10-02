const LICENSE = "https://creativecommons.org/licenses/by-sa/4.0/";

/** Required attribution for results taken from Wikipedia (CC BY-SA 4.0). */
export function WikiCredit({ sources, className = "" }: { sources: { title: string; url: string }[]; className?: string }) {
  if (sources.length === 0) return null;
  return (
    <p className={`text-xs text-muted ${className}`}>
      Results from Wikipedia:{" "}
      {sources.map((s, i) => (
        <span key={s.url}>
          {i > 0 && ", "}
          <a href={s.url} className="underline underline-offset-2 hover:text-foreground">
            {s.title}
          </a>
        </span>
      ))}
      {" · "}
      <a href={LICENSE} className="underline underline-offset-2 hover:text-foreground">
        CC BY-SA 4.0
      </a>
    </p>
  );
}
