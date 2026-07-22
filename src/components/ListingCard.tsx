import Link from "next/link";
import { StatusSelect } from "@/components/StatusSelect";
import type { ListingRow } from "@/lib/types";

export function ListingCard({ listing }: { listing: ListingRow }) {
  return (
    <article className="flex flex-col overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-black/5 sm:flex-row">
      <div className="aspect-[4/3] w-full shrink-0 overflow-hidden bg-stone-200 sm:w-44">
        {listing.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.thumbnail_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted">
            No photo
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <Link
              href={listing.url}
              target="_blank"
              rel="noreferrer"
              className="text-base font-medium leading-snug hover:text-accent"
            >
              {listing.title}
            </Link>
            <p className="text-sm text-muted">
              {listing.price_text ?? "—"}
              {listing.location ? ` · ${listing.location}` : ""}
              {listing.posted_text ? ` · ${listing.posted_text}` : ""}
            </p>
          </div>
          <StatusSelect listingId={listing.id} status={listing.status} />
        </div>

        {listing.description_snippet ? (
          <p className="line-clamp-2 text-sm text-foreground/80">
            {listing.description_snippet}
          </p>
        ) : null}

        {listing.is_excluded ? (
          <p className="text-xs font-medium text-amber-800">
            Excluded: {listing.matched_exclude_terms.join(", ")}
          </p>
        ) : null}
      </div>
    </article>
  );
}
