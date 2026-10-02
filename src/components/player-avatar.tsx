import type { PlayerImage } from "@/lib/data/tennis";
import { flagCode } from "@/lib/flags";
import { initials } from "@/lib/format";
import { thumbUrl } from "@/lib/photos/thumb";

const SIZES = {
  sm: { box: "size-8 text-xs", thumb: 120 },
  lg: { box: "size-28 text-3xl sm:size-36 sm:text-4xl", thumb: 330 },
} as const;

/**
 * Credited Wikimedia photo when we have one, otherwise initials. The large size adds a country
 * flag badge (none for neutral athletes).
 */
export function PlayerAvatar({
  name,
  image,
  countryCode = null,
  size = "sm",
}: {
  name: string;
  image: PlayerImage | null;
  countryCode?: string | null;
  size?: keyof typeof SIZES;
}) {
  const { box, thumb } = SIZES[size];
  const large = size === "lg";
  const flag = large ? flagCode(countryCode) : null;

  const face = image ? (
    // Wikimedia serves pre-sized thumbnails; next/image would only add a second resize.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbUrl(image.imageUrl, thumb)}
      alt={large ? name : ""}
      loading={large ? "eager" : "lazy"}
      decoding="async"
      className={`${box} shrink-0 rounded-full bg-surface-muted object-cover object-top`}
    />
  ) : (
    <span
      role={large ? "img" : undefined}
      aria-label={large ? name : undefined}
      aria-hidden={large ? undefined : true}
      className={`${box} inline-flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent`}
    >
      {initials(name)}
    </span>
  );

  if (!flag) return face;
  return (
    <span className="relative inline-flex shrink-0">
      {face}
      {/* Wrapper carries the position: flag-icons' unlayered .fi rule would override "absolute". */}
      <span aria-hidden className="absolute bottom-1.5 right-1.5 flex sm:bottom-2.5 sm:right-2.5">
        <span
          className={`fi fi-${flag} rounded-sm shadow ring-2 ring-background`}
          style={{ width: "1.75rem", height: "1.3rem", backgroundSize: "cover" }}
        />
      </span>
    </span>
  );
}
