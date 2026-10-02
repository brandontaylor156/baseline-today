"use client";

import { useRouter } from "next/navigation";

import { formatDate } from "@/lib/format";

/** Picks a stored ranking snapshot; the newest date is the plain URL. */
export function DateSelect({ basePath, dates, value }: { basePath: string; dates: string[]; value: string }) {
  const router = useRouter();
  if (dates.length < 2) return <p className="text-sm text-muted">As of {formatDate(value)}</p>;

  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      As of
      <select
        value={value}
        onChange={(e) => router.push(e.target.value === dates[0] ? basePath : `${basePath}?date=${e.target.value}`)}
        className="rounded-md border border-border bg-surface px-2 py-1 text-foreground"
      >
        {dates.map((d) => (
          <option key={d} value={d}>
            {formatDate(d)}
          </option>
        ))}
      </select>
    </label>
  );
}
