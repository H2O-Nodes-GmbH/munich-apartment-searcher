import type { ParsedListing } from "@/lib/scraper/types";

export type ExclusionMatch = {
  isExcluded: boolean;
  matchedTerms: string[];
};

/**
 * Case-insensitive substring match of exclude terms against title + description.
 * Listings are still stored when excluded — only flagged.
 */
export function matchExcludeTerms(
  listing: Pick<ParsedListing, "title" | "descriptionSnippet">,
  terms: string[],
): ExclusionMatch {
  const haystack = `${listing.title}\n${listing.descriptionSnippet ?? ""}`.toLowerCase();
  const matchedTerms = terms
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((term) => haystack.includes(term.toLowerCase()));

  return {
    isExcluded: matchedTerms.length > 0,
    matchedTerms,
  };
}
