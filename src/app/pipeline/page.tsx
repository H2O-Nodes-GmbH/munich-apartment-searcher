import Link from "next/link";
import { connection } from "next/server";
import { AppNav } from "@/components/AppNav";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { MessageTemplateEditor } from "@/components/MessageTemplateEditor";
import { PipelineCard } from "@/components/PipelineCard";
import { BOARD_STAGES, DEFAULT_MESSAGE_TEMPLATE } from "@/lib/pipeline";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { ListingEventRow, ListingRow } from "@/lib/types";

const EVENTS_PER_LISTING = 5;

export default async function PipelinePage() {
  await connection();
  const supabase = getServiceSupabase();

  const [boardResult, countsResult, templateResult] = await Promise.all([
    supabase
      .from("listings")
      .select("*")
      .in(
        "status",
        BOARD_STAGES.map((s) => s.value),
      )
      .order("stage_changed_at", { ascending: false, nullsFirst: false }),
    supabase
      .from("listings")
      .select("status")
      .eq("is_excluded", false)
      .in("status", ["new", "lost"]),
    supabase
      .from("message_templates")
      .select("body")
      .eq("id", "default")
      .maybeSingle(),
  ]);

  const error = boardResult.error ?? countsResult.error ?? templateResult.error;
  if (error) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Database error</h1>
        <p className="mt-2 text-sm text-red-700">{error.message}</p>
        <p className="mt-4 text-sm text-muted">
          If a column or table is missing, run{" "}
          <code className="font-mono text-xs">supabase/crm.sql</code> in the
          SQL editor.
        </p>
      </main>
    );
  }

  const listings = (boardResult.data ?? []) as ListingRow[];
  const inboxCount = (countsResult.data ?? []).filter(
    (r) => r.status === "new",
  ).length;
  const lostCount = (countsResult.data ?? []).filter(
    (r) => r.status === "lost",
  ).length;
  const template =
    (templateResult.data?.body as string | undefined) ??
    DEFAULT_MESSAGE_TEMPLATE;

  const eventsByListing = new Map<string, ListingEventRow[]>();
  if (listings.length > 0) {
    const { data: events } = await supabase
      .from("listing_events")
      .select("*")
      .in(
        "listing_id",
        listings.map((l) => l.id),
      )
      .order("created_at", { ascending: false });
    for (const event of (events ?? []) as ListingEventRow[]) {
      const list = eventsByListing.get(event.listing_id) ?? [];
      if (list.length < EVENTS_PER_LISTING) list.push(event);
      eventsByListing.set(event.listing_id, list);
    }
  }

  return (
    <main className="flex w-full flex-1 flex-col gap-8 px-6 py-10">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <AppNav active="pipeline" />
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-muted">
            {listings.length} in progress ·{" "}
            <Link href="/?status=new" className="underline">
              {inboxCount} in inbox
            </Link>{" "}
            ·{" "}
            <Link href="/?status=lost" className="underline">
              {lostCount} lost
            </Link>
          </p>
          <p className="text-sm text-muted">
            Move listings from the Inbox to Shortlisted to start working them.
          </p>
        </header>

        <CollapsibleSection
          title="Message template"
          description="Used to draft the first message to a landlord. Placeholders: {{title}}, {{price}}, {{location}}, {{url}}."
        >
          <MessageTemplateEditor initialBody={template} />
        </CollapsibleSection>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {BOARD_STAGES.map((stage) => {
          const items = listings.filter((l) => l.status === stage.value);
          return (
            <section
              key={stage.value}
              className="flex w-72 shrink-0 flex-col gap-3 rounded-xl bg-stone-200/50 p-3"
            >
              <h2 className="flex items-center justify-between px-1 text-sm font-medium">
                {stage.label}
                <span className="rounded-full bg-white px-2 py-0.5 text-xs text-muted">
                  {items.length}
                </span>
              </h2>
              {items.map((listing) => (
                <PipelineCard
                  key={listing.id}
                  listing={listing}
                  events={eventsByListing.get(listing.id) ?? []}
                  template={template}
                />
              ))}
            </section>
          );
        })}
      </div>
    </main>
  );
}
