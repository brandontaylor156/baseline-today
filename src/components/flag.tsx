import { flagCode } from "@/lib/flags";

/** Country flag (flag-icons, MIT) with the IOC code as accessible text. Neutral athletes get no flag. */
export function Flag({ code, className = "", reserve = false }: { code: string | null; className?: string; reserve?: boolean }) {
  const iso = flagCode(code);
  // reserve: keep the flag's width so names line up in score rows.
  if (!iso) return reserve ? <span aria-hidden className="inline-block w-[1.333em] shrink-0" /> : null;
  return <span aria-hidden className={`fi fi-${iso} shrink-0 rounded-[2px] ${className}`} />;
}
