import type { ParsedListing } from "@/lib/scraper/types";

export type ExclusionMatch = {
  isExcluded: boolean;
  matchedTerms: string[];
};

/** Short terms match as whole words only (avoids accidental substring hits). */
const WORD_BOUNDARY_TERMS = new Set(["wg", "swap"]);

/** Terms with custom matching logic (see matchers below). */
const CUSTOM_TERM_MATCHERS: Record<
  string,
  (listing: Pick<ParsedListing, "title" | "descriptionSnippet">) => boolean
> = {
  gesucht: (listing) => matchesHousingWantedAd(listing.title),
  gesuch: (listing) => matchesHousingWantedAd(listing.title),
};

/**
 * Case-insensitive match of exclude terms against title + description.
 * Listings are still stored when excluded — only flagged.
 */
export function matchExcludeTerms(
  listing: Pick<ParsedListing, "title" | "descriptionSnippet">,
  terms: string[],
): ExclusionMatch {
  const matchedTerms = terms
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((term) => termMatches(listing, term));

  return {
    isExcluded: matchedTerms.length > 0,
    matchedTerms,
  };
}

function termMatches(
  listing: Pick<ParsedListing, "title" | "descriptionSnippet">,
  term: string,
): boolean {
  const normalized = term.toLowerCase();
  const custom = CUSTOM_TERM_MATCHERS[normalized];
  if (custom) return custom(listing);

  const haystack = `${listing.title}\n${listing.descriptionSnippet ?? ""}`;
  if (WORD_BOUNDARY_TERMS.has(normalized)) {
    return new RegExp(`\\b${escapeRegExp(normalized)}\\b`, "i").test(haystack);
  }
  return haystack.toLowerCase().includes(normalized);
}

/**
 * Kleinanzeigen "Gesuch" = someone looking for a flat (not offering one).
 * Keeps legitimate offers like "Mieter gesucht" / "Nachmieter gesucht".
 */
export function matchesHousingWantedAd(title: string): boolean {
  const t = title.trim().toLowerCase();
  if (!t) return false;

  if (/\b(mieter|nachmieter|untermieter|mitbewohner)\s+gesucht\b/.test(t)) {
    return false;
  }

  if (/^(gesucht|gesuch)\b/.test(t)) return true;
  if (/\b(wohnung|whg|apartment|zimmer)\s+gesucht\b/.test(t)) return true;
  if (/\bgesucht\b/.test(t) && /\bbelohnung\b/.test(t)) return true;

  return false;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
