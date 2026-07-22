import { excludeTermHint } from "@/lib/exclude-labels";
import { CollapsibleSection } from "@/components/CollapsibleSection";

export function ExcludeTermsPanel({ terms }: { terms: string[] }) {
  return (
    <CollapsibleSection
      title="Excluded words"
      description="Hidden from the dashboard and Telegram when matched in title or description."
      badge={`${terms.length} term${terms.length === 1 ? "" : "s"}`}
    >
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
        Edit in Supabase <code className="font-mono">exclude_terms</code>. Keeps:
        möbliert · Excludes: swap/tausch, Untermiete, Zwischenmiete, WG, Gesuch.
        “Mieter gesucht” offers are kept.
      </p>
    </CollapsibleSection>
  );
}
