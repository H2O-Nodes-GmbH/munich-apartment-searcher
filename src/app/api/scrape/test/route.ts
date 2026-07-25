import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { matchExcludeTerms } from "@/lib/exclude";
import { scrapeSearchUrl } from "@/lib/scraper";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEFAULT_TEST_URL =
  "https://www.kleinanzeigen.de/s-wohnung-mieten/muenchen/c203l6411";

const SEED_EXCLUDE_TERMS = [
  "tausch",
  "swap",
  "tauschwohnung",
  "wohnungstausch",
  "tauschobjekt",
  "mietertausch",
  "untermiete",
  "zwischenmiete",
  "wg",
  "wohngemeinschaft",
  "gesucht",
  "gesuch",
  "suchen",
  "suche",
];

/**
 * Manual scrape smoke test — no DB writes.
 *
 * GET /api/scrape/test?url=<kleinanzeigen-search-url>
 * Auth: Authorization: Bearer <CRON_SECRET|APP_PASSWORD>
 *    or ?secret=<...>
 *
 * Optional: &applyExclude=1 to preview exclusion flags using the seed term list.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url") || DEFAULT_TEST_URL;
  const applyExclude = searchParams.get("applyExclude") === "1";

  try {
    const result = await scrapeSearchUrl(url);

    const listings = applyExclude
      ? result.listings.map((listing) => {
          const match = matchExcludeTerms(listing, SEED_EXCLUDE_TERMS);
          return {
            ...listing,
            postedAt: listing.postedAt?.toISOString() ?? null,
            isExcluded: match.isExcluded,
            matchedExcludeTerms: match.matchedTerms,
          };
        })
      : result.listings.map((listing) => ({
          ...listing,
          postedAt: listing.postedAt?.toISOString() ?? null,
        }));

    return NextResponse.json({
      ok: true,
      scrapedAt: new Date().toISOString(),
      url: result.url,
      finalUrl: result.finalUrl,
      httpStatus: result.status,
      listingCount: result.listingCount,
      likelyBlocked: result.likelyBlocked,
      excludePreview: applyExclude,
      listings,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
