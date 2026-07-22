import Link from "next/link";

export type DashboardFilters = {
  status: string;
  searchConfigId: string;
  showExcluded: boolean;
  sort: "newest" | "price_asc" | "price_desc";
};

export function FilterBar({
  filters,
  searches,
}: {
  filters: DashboardFilters;
  searches: { id: string; name: string }[];
}) {
  return (
    <form className="flex flex-wrap items-end gap-3" method="get">
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Status</span>
        <select
          name="status"
          defaultValue={filters.status}
          className="rounded-md border border-black/10 bg-white px-3 py-2"
        >
          <option value="all">All</option>
          <option value="new">New</option>
          <option value="interested">Interested</option>
          <option value="contacted">Contacted</option>
          <option value="rejected">Rejected</option>
          <option value="open">Open (not rejected)</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Search</span>
        <select
          name="search"
          defaultValue={filters.searchConfigId}
          className="rounded-md border border-black/10 bg-white px-3 py-2"
        >
          <option value="all">All searches</option>
          {searches.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted">Sort</span>
        <select
          name="sort"
          defaultValue={filters.sort}
          className="rounded-md border border-black/10 bg-white px-3 py-2"
        >
          <option value="newest">Newest first</option>
          <option value="price_asc">Price ↑</option>
          <option value="price_desc">Price ↓</option>
        </select>
      </label>

      <label className="flex items-center gap-2 pb-2 text-sm">
        <input
          type="checkbox"
          name="excluded"
          value="1"
          defaultChecked={filters.showExcluded}
        />
        Show excluded
      </label>

      <button
        type="submit"
        className="rounded-md bg-stone-900 px-4 py-2 text-sm font-medium text-white"
      >
        Apply
      </button>

      <Link href="/" className="pb-2 text-sm text-muted underline">
        Reset
      </Link>
    </form>
  );
}
