// Pure parsing for Wikidata entities and Commons image metadata (unit tested, no network).

import type { Tour } from "@/lib/provider/types";

export const TENNIS_PLAYER = "Q10833314";
const SEX_FOR_TOUR: Record<Tour, string> = { atp: "Q6581097", wta: "Q6581072" };

interface Snak {
  mainsnak: { datavalue?: { value: unknown } };
}
export interface WikidataEntity {
  id: string;
  claims?: Record<string, Snak[]>;
}

function values(entity: WikidataEntity, property: string): unknown[] {
  return (entity.claims?.[property] ?? []).map((c) => c.mainsnak.datavalue?.value).filter((v) => v !== undefined);
}

function itemIds(entity: WikidataEntity, property: string): string[] {
  return values(entity, property).map((v) => (v as { id?: string }).id ?? "").filter(Boolean);
}

/** A tennis player of the tour's sex. Guards against same-name footballers, politicians, etc. */
export function isTourPlayer(entity: WikidataEntity, tour: Tour): boolean {
  return itemIds(entity, "P106").includes(TENNIS_PLAYER) && itemIds(entity, "P21").includes(SEX_FOR_TOUR[tour]);
}

/** First candidate (search order = relevance) that is a tennis player of the right sex. */
export function pickPlayerEntity(candidates: WikidataEntity[], tour: Tour): WikidataEntity | null {
  return candidates.find((e) => isTourPlayer(e, tour)) ?? null;
}

export function imageFileName(entity: WikidataEntity): string | null {
  const file = values(entity, "P18")[0];
  return typeof file === "string" ? file : null;
}

/** Birth date as YYYY-MM-DD, only when Wikidata has day precision (11). */
export function birthDate(entity: WikidataEntity): string | null {
  const v = values(entity, "P569")[0] as { time?: string; precision?: number } | undefined;
  const match = v?.time?.match(/^\+(\d{4}-\d{2}-\d{2})T/);
  return match && v?.precision === 11 ? match[1] : null;
}

/** Commons "Artist" is HTML; reduce it to plain text for the credit line. */
export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Commons only hosts free files, but we still only accept licenses we can credit correctly. */
export function isFreeLicense(shortName: string): boolean {
  return /^(CC BY(-SA)? [\d.]+|CC0|Public domain|PD\b)/i.test(shortName.trim());
}

export interface CommonsImageInfo {
  thumburl?: string;
  descriptionurl?: string;
  extmetadata?: Record<string, { value: string } | undefined>;
}

export interface ParsedImage {
  imageUrl: string;
  sourceUrl: string;
  author: string;
  license: string;
  licenseUrl: string | null;
}

export function parseImageInfo(info: CommonsImageInfo | undefined): ParsedImage | null {
  const meta = info?.extmetadata;
  const license = meta?.LicenseShortName?.value?.trim();
  if (!info?.thumburl || !info.descriptionurl || !license || !isFreeLicense(license)) return null;

  const author = plainText(meta?.Artist?.value ?? "") || "Unknown author";
  return {
    imageUrl: info.thumburl.split("?")[0],
    sourceUrl: info.descriptionurl,
    author: author.length > 200 ? `${author.slice(0, 197)}…` : author,
    license,
    licenseUrl: meta?.LicenseUrl?.value?.trim() || null,
  };
}
