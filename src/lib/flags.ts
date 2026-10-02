// IOC country codes (as used by the tours and our provider) → ISO 3166-1 alpha-2 for flag-icons.

/** Players from these countries compete as neutral athletes, so no flag is shown. */
const NEUTRAL = new Set(["RUS", "BLR"]);

const IOC_TO_ISO: Record<string, string> = {
  ALG: "dz", AND: "ad", ARG: "ar", ARM: "am", AUS: "au", AUT: "at", AZE: "az",
  BAH: "bs", BAR: "bb", BEL: "be", BIH: "ba", BOL: "bo", BRA: "br", BUL: "bg",
  CAN: "ca", CHI: "cl", CHN: "cn", COL: "co", CRC: "cr", CRO: "hr", CYP: "cy", CZE: "cz",
  DEN: "dk", DOM: "do", ECU: "ec", EGY: "eg", ESA: "sv", ESP: "es", EST: "ee",
  FIN: "fi", FRA: "fr", GBR: "gb", GEO: "ge", GER: "de", GRE: "gr", GUA: "gt",
  HKG: "hk", HUN: "hu", INA: "id", IND: "in", IRI: "ir", IRL: "ie", ISL: "is", ISR: "il", ITA: "it",
  JAM: "jm", JOR: "jo", JPN: "jp", KAZ: "kz", KOR: "kr", KSA: "sa", KOS: "xk",
  LAT: "lv", LIB: "lb", LIE: "li", LTU: "lt", LUX: "lu",
  MAR: "ma", MAS: "my", MDA: "md", MEX: "mx", MKD: "mk", MLT: "mt", MNE: "me", MON: "mc",
  NED: "nl", NOR: "no", NZL: "nz", PAK: "pk", PAR: "py", PER: "pe", PHI: "ph", POL: "pl", POR: "pt", PUR: "pr",
  QAT: "qa", ROU: "ro", RSA: "za", SLO: "si", SRB: "rs", SUI: "ch", SVK: "sk", SWE: "se",
  THA: "th", TPE: "tw", TUN: "tn", TUR: "tr", UAE: "ae", UKR: "ua", URU: "uy", USA: "us", UZB: "uz",
  VEN: "ve", VIE: "vn", ZIM: "zw",
};

/** ISO code for flag-icons, or null when there is no flag to show. */
export function flagCode(iocCode: string | null): string | null {
  if (!iocCode) return null;
  const code = iocCode.toUpperCase();
  if (NEUTRAL.has(code)) return null;
  return IOC_TO_ISO[code] ?? null;
}
