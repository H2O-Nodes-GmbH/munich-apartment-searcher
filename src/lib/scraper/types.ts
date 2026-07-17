/**
 * Parsed listing from a Kleinanzeigen search results page.
 * Selectors live in parseListings.ts — update there when the site markup changes.
 */
export type ParsedListing = {
  externalId: string;
  title: string;
  priceText: string | null;
  priceEur: number | null;
  location: string | null;
  url: string;
  thumbnailUrl: string | null;
  descriptionSnippet: string | null;
  /** Original relative date string, e.g. "Heute, 20:57" or "12.07.2026" */
  postedText: string | null;
  /** Best-effort absolute timestamp when postedText can be parsed */
  postedAt: Date | null;
};
