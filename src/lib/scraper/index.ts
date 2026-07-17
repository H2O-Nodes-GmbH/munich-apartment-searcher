import { fetchSearchPage, sleep } from "./fetchSearchPage";
import { parseListings } from "./parseListings";
import type { ParsedListing } from "./types";

export type ScrapeResult = {
  url: string;
  finalUrl: string;
  status: number;
  listingCount: number;
  listings: ParsedListing[];
  /** True when HTML has no article.aditem — often a block/challenge page */
  likelyBlocked: boolean;
};

export type ScrapeSearchUrlOptions = {
  /** Delay before the request (ms). Useful when polling multiple URLs. */
  delayMs?: number;
};

/**
 * Fetch + parse one Kleinanzeigen search URL.
 * Selectors are isolated in parseListings.ts.
 */
export async function scrapeSearchUrl(
  url: string,
  options: ScrapeSearchUrlOptions = {},
): Promise<ScrapeResult> {
  if (options.delayMs && options.delayMs > 0) {
    await sleep(options.delayMs);
  }

  const { html, finalUrl, status } = await fetchSearchPage(url);
  const listings = parseListings(html);
  const likelyBlocked =
    status !== 200 ||
    (listings.length === 0 &&
      !html.includes("article") &&
      !html.includes("aditem"));

  return {
    url,
    finalUrl,
    status,
    listingCount: listings.length,
    listings,
    likelyBlocked,
  };
}

export { parseListings, parsePriceEur, parsePostedAt } from "./parseListings";
export { fetchSearchPage, ensureDateSort, sleep } from "./fetchSearchPage";
export type { ParsedListing } from "./types";
