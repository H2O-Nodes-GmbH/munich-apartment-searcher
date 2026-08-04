"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteSearchConfig,
  setSearchConfigActive,
} from "@/app/actions";
import {
  formatSearchFilterChips,
  parseKleinanzeigenSearchUrl,
} from "@/lib/kleinanzeigen/parseSearchUrl";
import type { SearchConfigRow } from "@/lib/types";

export function SearchConfigCard({ search }: { search: SearchConfigRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const parsed = parseKleinanzeigenSearchUrl(search.search_url);
  const chips = formatSearchFilterChips(parsed);

  function run(action: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed");
      }
    });
  }

  return (
    <li className="space-y-3 rounded-lg border border-black/5 bg-white/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="font-medium">{search.name}</span>
          <span className="text-muted">
            {" "}
            · {search.active ? "active" : "paused"}
            {search.last_polled_at
              ? ` · last poll ${new Date(search.last_polled_at).toLocaleString("de-DE")}`
              : " · never polled"}
          </span>
        </div>
        <a
          href={search.search_url}
          target="_blank"
          rel="noreferrer"
          className="text-xs text-accent underline"
        >
          Open on Kleinanzeigen
        </a>
      </div>

      {chips.length > 0 ? (
        <dl className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <div
              key={`${chip.label}-${chip.value}`}
              className="rounded-full bg-stone-100 px-3 py-1 text-xs"
            >
              <dt className="inline text-muted">{chip.label}: </dt>
              <dd className="inline font-medium">{chip.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-xs text-muted">
          No parsed filters — check the URL below.
        </p>
      )}

      <p className="break-all font-mono text-[11px] leading-relaxed text-muted">
        {search.search_url}
      </p>
      <p className="text-[11px] text-muted">
        Polls sort by newest automatically (
        <code className="font-mono">sortingField=SORTING_DATE</code> appended if
        missing).
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() => setSearchConfigActive(search.id, !search.active))
          }
          className="rounded-md border border-black/10 bg-white px-3 py-1.5 text-sm disabled:opacity-60"
        >
          {search.active ? "Pause" : "Resume"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            if (
              !window.confirm(
                `Remove “${search.name}”? Existing listings stay; only polling stops.`,
              )
            ) {
              return;
            }
            run(() => deleteSearchConfig(search.id));
          }}
          className="rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-800 disabled:opacity-60"
        >
          Remove
        </button>
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </li>
  );
}
