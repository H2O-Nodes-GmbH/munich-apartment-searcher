"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { updateListingDetails, updateListingStatus } from "@/app/actions";
import {
  APP_TIME_ZONE,
  nextStage,
  previousStage,
  renderMessage,
  stageLabel,
  toBerlinInputValue,
} from "@/lib/pipeline";
import type { ListingEventRow, ListingRow, ListingStatus } from "@/lib/types";

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function PipelineCard({
  listing,
  events,
  template,
}: {
  listing: ListingRow;
  events: ListingEventRow[];
  template: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => renderMessage(template, listing));
  const [copied, setCopied] = useState(false);
  const [notes, setNotes] = useState(listing.notes ?? "");
  const [viewingAt, setViewingAt] = useState(
    toBerlinInputValue(listing.viewing_at),
  );

  const forward = nextStage(listing.status);
  const back = previousStage(listing.status);
  const days = daysSince(listing.stage_changed_at);

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

  function move(status: ListingStatus) {
    run(() => updateListingStatus(listing.id, status));
  }

  return (
    <article className="flex min-w-0 flex-col gap-2 rounded-lg bg-card p-3 text-sm shadow-sm ring-1 ring-black/5">
      {listing.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={listing.thumbnail_url}
          alt=""
          className="aspect-[4/3] w-full rounded-md object-cover"
        />
      ) : null}

      <a
        href={listing.url}
        target="_blank"
        rel="noreferrer"
        className="break-words font-medium leading-snug hover:text-accent"
      >
        {listing.title}
      </a>
      <p className="text-xs text-muted">
        {listing.price_text ?? "—"}
        {listing.location ? ` · ${listing.location}` : ""}
        {days !== null ? ` · ${days}d in stage` : ""}
      </p>

      {listing.viewing_at ? (
        <p className="text-xs font-medium text-accent">
          Viewing{" "}
          {new Date(listing.viewing_at).toLocaleString("de-DE", {
            timeZone: APP_TIME_ZONE,
            weekday: "short",
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      ) : null}

      {listing.status === "shortlisted" ? (
        <details className="rounded-md bg-stone-50 p-2">
          <summary className="cursor-pointer text-xs font-medium">
            Draft message
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={8}
              className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs leading-relaxed"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={async () => {
                  await navigator.clipboard.writeText(draft);
                  setCopied(true);
                  window.open(listing.url, "_blank", "noreferrer");
                }}
                className="min-h-9 rounded-md border border-black/10 bg-white px-3 py-2 text-xs"
              >
                {copied ? "Copied ✓" : "Copy & open listing"}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => move("messaged")}
                className="min-h-9 rounded-md bg-accent px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
              >
                Mark messaged
              </button>
            </div>
          </div>
        </details>
      ) : null}

      {listing.send_status === "sent" && listing.message_body ? (
        <details className="rounded-md bg-stone-50 p-2">
          <summary className="cursor-pointer text-xs font-medium">
            Sent message
            {listing.sent_at
              ? ` · ${new Date(listing.sent_at).toLocaleString("de-DE", {
                  timeZone: APP_TIME_ZONE,
                  weekday: "short",
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : ""}
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            <p className="text-[11px] text-muted">
              {events.some((event) => event.kind === "send_confirmed")
                ? "✅ Delivery confirmed by email"
                : "Sent via Kleinanzeigen · no confirmation email (normal for private landlords)"}
            </p>
            <p className="whitespace-pre-wrap break-words rounded-md border border-black/10 bg-white px-2 py-1.5 text-xs leading-relaxed">
              {listing.message_body}
            </p>
          </div>
        </details>
      ) : null}

      <details className="rounded-md bg-stone-50 p-2">
        <summary className="cursor-pointer text-xs font-medium">
          Notes & viewing{listing.notes ? " •" : ""}
        </summary>
        <form
          className="mt-2 flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => updateListingDetails(listing.id, { notes, viewingAt }));
          }}
        >
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Landlord name, phone, impressions…"
            className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs"
          />
          <label className="flex flex-col gap-1 text-xs text-muted">
            Viewing date
            <input
              type="datetime-local"
              value={viewingAt}
              onChange={(e) => setViewingAt(e.target.value)}
              className="rounded-md border border-black/10 bg-white px-2 py-1 text-xs text-foreground"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="w-fit rounded-md border border-black/10 bg-white px-2 py-1 text-xs disabled:opacity-60"
          >
            Save
          </button>
        </form>
        {events.length > 0 ? (
          <ul className="mt-2 space-y-0.5 border-t border-black/5 pt-2 text-[11px] text-muted">
            {events.map((event) => (
              <li key={event.id}>
                {new Date(event.created_at).toLocaleDateString("de-DE", {
                  timeZone: APP_TIME_ZONE,
                })}{" "}
                ·{" "}
                {event.kind === "stage"
                  ? `→ ${event.detail}`
                  : event.kind === "reply"
                    ? `💬 ${event.detail}`
                    : event.kind === "send_confirmed"
                      ? `✅ ${event.detail}`
                      : event.detail}
              </li>
            ))}
          </ul>
        ) : null}
      </details>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {back ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => move(back)}
            title={`Back to ${stageLabel(back)}`}
            className="min-h-9 min-w-9 rounded-md border border-black/10 bg-white px-3 py-2 text-xs disabled:opacity-60"
          >
            ←
          </button>
        ) : null}
        {forward ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => move(forward)}
            className="min-h-9 rounded-md bg-stone-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
          >
            {stageLabel(forward)} →
          </button>
        ) : null}
        <button
          type="button"
          disabled={pending}
          onClick={() => move("lost")}
          className="ml-auto min-h-9 rounded-md border border-red-200 bg-white px-3 py-2 text-xs text-red-800 hover:bg-red-50 disabled:opacity-60"
        >
          Lost
        </button>
      </div>
      {error ? <p className="text-xs text-red-700">{error}</p> : null}
    </article>
  );
}
