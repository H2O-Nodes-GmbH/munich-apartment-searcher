import { matchExcludeTerms } from "@/lib/exclude";
import {
  createNotifierFromEnv,
  type NotifiableListing,
} from "@/lib/notifications";
import { scrapeSearchUrl } from "@/lib/scraper";
import type { ParsedListing } from "@/lib/scraper/types";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { ListingRow, SearchConfigRow } from "@/lib/types";

const DEFAULT_DELAY_MS = 3_000;

export type PollSummary = {
  searched: number;
  scraped: number;
  inserted: number;
  updated: number;
  notified: number;
  excludedNew: number;
  errors: { searchConfigId: string; name: string; error: string }[];
};

export async function pollActiveSearches(options?: {
  delayMs?: number;
  notify?: boolean;
}): Promise<PollSummary> {
  const supabase = getServiceSupabase();
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS;
  const shouldNotify = options?.notify !== false;

  const { data: configs, error: configError } = await supabase
    .from("search_configs")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: true });

  if (configError) throw new Error(configError.message);

  const { data: termRows, error: termError } = await supabase
    .from("exclude_terms")
    .select("term");

  if (termError) throw new Error(termError.message);
  const excludeTerms = (termRows ?? []).map((r) => r.term as string);

  const summary: PollSummary = {
    searched: configs?.length ?? 0,
    scraped: 0,
    inserted: 0,
    updated: 0,
    notified: 0,
    excludedNew: 0,
    errors: [],
  };

  const newlyInsertedForNotify: NotifiableListing[] = [];
  const searchConfigs = (configs ?? []) as SearchConfigRow[];

  for (let i = 0; i < searchConfigs.length; i++) {
    const config = searchConfigs[i];
    try {
      const result = await scrapeSearchUrl(config.search_url, {
        delayMs: i === 0 ? 0 : delayMs,
      });

      if (result.likelyBlocked) {
        summary.errors.push({
          searchConfigId: config.id,
          name: config.name,
          error: `Likely blocked or empty page (HTTP ${result.status})`,
        });
        continue;
      }

      summary.scraped += result.listingCount;

      const persist = await persistListings({
        listings: result.listings,
        searchConfigId: config.id,
        excludeTerms,
      });

      summary.inserted += persist.inserted.length;
      summary.updated += persist.updatedCount;
      summary.excludedNew += persist.inserted.filter((l) => l.is_excluded).length;

      for (const row of persist.inserted) {
        if (!row.is_excluded) {
          newlyInsertedForNotify.push({
            title: row.title,
            priceText: row.price_text,
            location: row.location,
            url: row.url,
            postedText: row.posted_text,
          });
        }
      }

      await supabase
        .from("search_configs")
        .update({ last_polled_at: new Date().toISOString() })
        .eq("id", config.id);
    } catch (error) {
      summary.errors.push({
        searchConfigId: config.id,
        name: config.name,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  if (shouldNotify && newlyInsertedForNotify.length > 0) {
    const notifier = createNotifierFromEnv();
    if (notifier) {
      await notifier.notifyNewListings(newlyInsertedForNotify);
      summary.notified = newlyInsertedForNotify.length;
    }
  }

  return summary;
}

async function persistListings(args: {
  listings: ParsedListing[];
  searchConfigId: string;
  excludeTerms: string[];
}): Promise<{ inserted: ListingRow[]; updatedCount: number }> {
  const supabase = getServiceSupabase();
  const now = new Date().toISOString();
  const externalIds = args.listings.map((l) => l.externalId);

  if (externalIds.length === 0) {
    return { inserted: [], updatedCount: 0 };
  }

  const { data: existing, error: existingError } = await supabase
    .from("listings")
    .select("external_id")
    .in("external_id", externalIds);

  if (existingError) throw new Error(existingError.message);

  const existingIds = new Set((existing ?? []).map((r) => r.external_id as string));
  const toInsert: ParsedListing[] = [];
  const toTouchIds: string[] = [];

  for (const listing of args.listings) {
    if (existingIds.has(listing.externalId)) {
      toTouchIds.push(listing.externalId);
    } else {
      toInsert.push(listing);
    }
  }

  let updatedCount = 0;
  if (toTouchIds.length > 0) {
    const { error: touchError, count } = await supabase
      .from("listings")
      .update({ last_seen_at: now }, { count: "exact" })
      .in("external_id", toTouchIds);

    if (touchError) throw new Error(touchError.message);
    updatedCount = count ?? toTouchIds.length;
  }

  if (toInsert.length === 0) {
    return { inserted: [], updatedCount };
  }

  const rows = toInsert.map((listing) => {
    const match = matchExcludeTerms(listing, args.excludeTerms);
    return {
      external_id: listing.externalId,
      search_config_id: args.searchConfigId,
      title: listing.title,
      price_text: listing.priceText,
      price_eur: listing.priceEur,
      location: listing.location,
      url: listing.url,
      thumbnail_url: listing.thumbnailUrl,
      description_snippet: listing.descriptionSnippet,
      posted_at: listing.postedAt?.toISOString() ?? null,
      posted_text: listing.postedText,
      is_excluded: match.isExcluded,
      matched_exclude_terms: match.matchedTerms,
      status: "new" as const,
      first_seen_at: now,
      last_seen_at: now,
    };
  });

  const { data: inserted, error: insertError } = await supabase
    .from("listings")
    .insert(rows)
    .select("*");

  if (insertError) throw new Error(insertError.message);

  return {
    inserted: (inserted ?? []) as ListingRow[],
    updatedCount,
  };
}
