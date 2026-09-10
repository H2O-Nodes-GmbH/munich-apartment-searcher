/** Short UI descriptions for exclude terms (especially non-obvious matchers). */
export const EXCLUDE_TERM_HINTS: Record<string, string> = {
  tausch: "Apartment swap offers",
  swap: "Swap listings (word match)",
  tauschwohnung: "Tauschwohnung",
  wohnungstausch: "Wohnungstausch",
  tauschobjekt: "Tauschobjekt",
  mietertausch: "Mietertausch",
  untermiete: "Sublets / Untermiete",
  zwischenmiete: "Temporary / Zwischenmiete",
  wg: "Shared flats (WG, whole word)",
  wohngemeinschaft: "Wohngemeinschaft",
  gesucht: "Wanted ads — someone seeking a flat",
  gesuch: "Gesuch wanted ads",
  suchen: "Wanted ads starting with Suchen/Suche",
  suche: "Wanted ads (Suche …)",
  wiesn: "Oktoberfest short-term sublets",
  oktoberfest: "Oktoberfest short-term sublets",
  "new-account": "Seller account less than 48 hours old",
};

export function excludeTermHint(term: string): string | null {
  return EXCLUDE_TERM_HINTS[term.toLowerCase()] ?? null;
}
