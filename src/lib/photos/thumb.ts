/** Wikimedia only serves standard thumbnail widths; other widths return an error page. */
export type ThumbWidth = 60 | 120 | 330;

/** Same Commons thumbnail at another standard width. URLs not in thumbnail form pass through. */
export function thumbUrl(url: string, width: ThumbWidth): string {
  return url.replace(/\/\d+px-([^/]+)$/, `/${width}px-$1`);
}
