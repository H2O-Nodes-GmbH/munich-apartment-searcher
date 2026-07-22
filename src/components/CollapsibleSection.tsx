import type { ReactNode } from "react";

export function CollapsibleSection({
  title,
  description,
  badge,
  children,
  defaultOpen = false,
}: {
  title: string;
  description?: string;
  badge?: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details
      open={defaultOpen || undefined}
      className="group rounded-xl bg-card shadow-sm ring-1 ring-black/5"
    >
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-medium">{title}</h2>
            {badge ? (
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs text-muted">
                {badge}
              </span>
            ) : null}
          </div>
          {description ? (
            <p className="text-sm text-muted">{description}</p>
          ) : null}
        </div>
        <span
          aria-hidden
          className="mt-1 shrink-0 text-muted transition-transform group-open:rotate-180"
        >
          ▾
        </span>
      </summary>
      <div className="space-y-4 border-t border-black/5 px-5 pb-5 pt-4">
        {children}
      </div>
    </details>
  );
}
