import { excludeTermHint } from "@/lib/exclude-labels";

export function ExcludeTermsPanel({ terms }: { terms: string[] }) {
  return (
    <section className="space-y-3 rounded-xl bg-card p-5 shadow-sm ring-1 ring-black/5">
      <div>
        <h2 className="text-lg font-medium">Excluded words</h2>
        <p className="mt-1 text-sm text-muted">
          Listings whose title or description matches any of these are still
          saved but hidden by default and never sent to Telegram. Edit in
          Supabase{" "}
          <code className="font-mono text-xs">exclude_terms</code>.
        </p>
      </div>

      {terms.length === 0 ? (
        <p className="text-sm text-muted">No exclude terms configured.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {terms.map((term) => {
            const hint = excludeTermHint(term);
            return (
              <li
                key={term}
                className="rounded-lg border border-amber-200/80 bg-amber-50/50 px-3 py-2 text-sm"
              >
                <span className="font-mono font-medium">{term}</span>
                {hint ? (
                  <p className="mt-0.5 text-xs text-muted">{hint}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-muted">
        Keeps: möbliert listings · Excludes: swap/tausch, Untermiete,
        Zwischenmiete, WG, Gesuch wanted ads. “Mieter gesucht” offers are kept.
      </p>
    </section>
  );
}
