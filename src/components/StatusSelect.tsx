"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { updateListingStatus } from "@/app/actions";
import type { ListingStatus } from "@/lib/types";

const OPTIONS: { value: ListingStatus; label: string }[] = [
  { value: "new", label: "New" },
  { value: "interested", label: "Interested" },
  { value: "contacted", label: "Contacted" },
  { value: "rejected", label: "Rejected" },
];

export function StatusSelect({
  listingId,
  status,
}: {
  listingId: string;
  status: ListingStatus;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <select
      className="rounded-md border border-black/10 bg-white px-2 py-1 text-sm disabled:opacity-60"
      value={status}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value as ListingStatus;
        startTransition(async () => {
          await updateListingStatus(listingId, next);
          router.refresh();
        });
      }}
    >
      {OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
