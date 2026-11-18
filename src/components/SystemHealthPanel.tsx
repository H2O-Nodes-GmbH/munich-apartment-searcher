"use client";

import { useEffect, useState, useTransition } from "react";
import type { HealthReport, HealthStatus } from "@/lib/health";

const STATUS_STYLES: Record<
  HealthStatus,
  { dot: string; label: string; chip: string }
> = {
  ok: {
    dot: "bg-emerald-500",
    label: "OK",
    chip: "bg-emerald-50 text-emerald-800",
  },
  warn: {
    dot: "bg-amber-500",
    label: "Warn",
    chip: "bg-amber-50 text-amber-900",
  },
  error: {
    dot: "bg-red-500",
    label: "Down",
    chip: "bg-red-50 text-red-800",
  },
  skip: {
    dot: "bg-stone-400",
    label: "Skip",
    chip: "bg-stone-100 text-stone-600",
  },
};

export function SystemHealthPanel({ initial }: { initial: HealthReport }) {
  const [report, setReport] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function refresh() {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      const json = (await res.json()) as HealthReport;
      setReport(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Refresh failed");
    }
  }

  useEffect(() => {
    const id = window.setInterval(() => {
      startTransition(() => {
        void refresh();
      });
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const overall = STATUS_STYLES[report.overall];

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium ${overall.chip}`}
          >
            <span className={`h-2 w-2 rounded-full ${overall.dot}`} />
            Overall {overall.label}
          </span>
          <span className="text-xs text-muted">
            Checked{" "}
            {new Date(report.checkedAt).toLocaleTimeString("en-GB", {
              timeZone: "Europe/Berlin",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}{" "}
            Berlin
          </span>
        </div>
        <button
          type="button"
          onClick={() => startTransition(() => void refresh())}
          disabled={pending}
          className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm hover:bg-stone-50 disabled:opacity-50"
        >
          {pending ? "Checking…" : "Refresh"}
        </button>
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      <ul className="divide-y divide-stone-200 overflow-hidden rounded-xl border border-stone-200 bg-card">
        {report.checks.map((check) => {
          const style = STATUS_STYLES[check.status];
          return (
            <li
              key={check.id}
              className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0 space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${style.dot}`} />
                  <span className="text-sm font-medium">{check.label}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${style.chip}`}
                  >
                    {style.label}
                  </span>
                </div>
                <p className="text-sm text-muted">{check.detail}</p>
              </div>
              {check.latencyMs != null ? (
                <span className="font-mono text-xs text-muted">
                  {check.latencyMs}ms
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {report.queue ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(
            [
              ["Queued", report.queue.queued],
              ["Sending", report.queue.sending],
              ["Sent", report.queue.sent],
              ["Failed", report.queue.failed],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-stone-200 bg-card px-4 py-3"
            >
              <p className="text-xs uppercase tracking-wide text-muted">
                {label}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
