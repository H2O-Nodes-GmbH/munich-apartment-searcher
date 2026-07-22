import { AddSearchForm } from "@/components/AddSearchForm";
import { ExcludeTermsPanel } from "@/components/ExcludeTermsPanel";
import { FilterBar, type DashboardFilters } from "@/components/FilterBar";
import { ListingCard } from "@/components/ListingCard";
import { SearchConfigCard } from "@/components/SearchConfigCard";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { ListingRow, SearchConfigRow } from "@/lib/types";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const filters: DashboardFilters = {
    status: first(params.status) || "open",
    searchConfigId: first(params.search) || "all",
    showExcluded: first(params.excluded) === "1",
    sort: (first(params.sort) as DashboardFilters["sort"]) || "newest",
  };

  const supabase = getServiceSupabase();

  const { data: searches, error: searchError } = await supabase
    .from("search_configs")
    .select("*")
    .order("created_at", { ascending: true });

  const { data: excludeTermRows } = await supabase
    .from("exclude_terms")
    .select("term")
    .order("term", { ascending: true });

  if (searchError) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Database error</h1>
        <p className="mt-2 text-sm text-red-700">{searchError.message}</p>
        <p className="mt-4 text-sm text-muted">
          If you see permission denied, run{" "}
          <code className="font-mono text-xs">supabase/grants.sql</code> in the
          SQL editor.
        </p>
      </main>
    );
  }

  let query = supabase.from("listings").select("*");

  if (!filters.showExcluded) {
    query = query.eq("is_excluded", false);
  }

  if (filters.status === "open") {
    query = query.neq("status", "rejected");
  } else if (filters.status !== "all") {
    query = query.eq("status", filters.status);
  }

  if (filters.searchConfigId !== "all") {
    query = query.eq("search_config_id", filters.searchConfigId);
  }

  if (filters.sort === "price_asc") {
    query = query.order("price_eur", { ascending: true, nullsFirst: false });
  } else if (filters.sort === "price_desc") {
    query = query.order("price_eur", { ascending: false, nullsFirst: false });
  } else {
    query = query.order("first_seen_at", { ascending: false });
  }

  const { data: listings, error: listingError } = await query.limit(100);

  if (listingError) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Database error</h1>
        <p className="mt-2 text-sm text-red-700">{listingError.message}</p>
      </main>
    );
  }

  const searchRows = (searches ?? []) as SearchConfigRow[];
  const listingRows = (listings ?? []) as ListingRow[];
  const excludeTerms = (excludeTermRows ?? []).map((row) => row.term as string);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-10">
      <header className="space-y-2">
        <p className="text-sm font-medium tracking-wide text-accent uppercase">
          Personal tool
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Munich Apartment Searcher
        </h1>
        <p className="text-muted">
          {listingRows.length} listing{listingRows.length === 1 ? "" : "s"} ·{" "}
          {searchRows.filter((s) => s.active).length} active search
          {searchRows.filter((s) => s.active).length === 1 ? "" : "es"}
        </p>
      </header>

      <section className="space-y-4 rounded-xl bg-card p-5 shadow-sm ring-1 ring-black/5">
        <h2 className="text-lg font-medium">Saved searches</h2>
        {searchRows.length === 0 ? (
          <p className="text-sm text-muted">
            Add a Kleinanzeigen search URL to start polling.
          </p>
        ) : (
          <ul className="space-y-3">
            {searchRows.map((s) => (
              <SearchConfigCard key={s.id} search={s} />
            ))}
          </ul>
        )}
        <AddSearchForm />
      </section>

      <ExcludeTermsPanel terms={excludeTerms} />

      <section className="space-y-4">
        <FilterBar
          filters={filters}
          searches={searchRows.map((s) => ({ id: s.id, name: s.name }))}
        />

        {listingRows.length === 0 ? (
          <p className="rounded-xl bg-card p-6 text-sm text-muted ring-1 ring-black/5">
            No listings yet. Add a search, then hit{" "}
            <code className="font-mono text-xs">/api/cron/poll</code> with your
            CRON_SECRET (or wait for Vercel cron).
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            {listingRows.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
