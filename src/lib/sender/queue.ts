import {
  DEFAULT_MESSAGE_TEMPLATE,
  renderMessage,
} from "@/lib/pipeline";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { ListingRow, SendStatus } from "@/lib/types";

const MESSAGE_TEMPLATE_ID = "default";

export async function loadMessageTemplate(): Promise<string> {
  const supabase = getServiceSupabase();
  const { data } = await supabase
    .from("message_templates")
    .select("body")
    .eq("id", MESSAGE_TEMPLATE_ID)
    .maybeSingle();
  return (data?.body as string | undefined)?.trim() || DEFAULT_MESSAGE_TEMPLATE;
}

/** Queue freshly discovered, non-excluded listings for automatic messaging. */
export async function queueListingsForSend(
  listings: Array<Pick<ListingRow, "id" | "title" | "price_text" | "location" | "url">>,
): Promise<number> {
  if (listings.length === 0) return 0;

  const supabase = getServiceSupabase();
  const template = await loadMessageTemplate();
  let queued = 0;

  for (const listing of listings) {
    const message = renderMessage(template, listing);
    const { error, count } = await supabase
      .from("listings")
      .update(
        {
          message_body: message,
          send_status: "queued" satisfies SendStatus,
          send_error: null,
        },
        { count: "exact" },
      )
      .eq("id", listing.id)
      .is("send_status", null)
      .eq("is_excluded", false);

    if (error) {
      console.error("Failed to queue listing", listing.id, error.message);
      continue;
    }
    queued += count ?? 0;
  }

  return queued;
}

export async function claimNextQueuedListing(): Promise<ListingRow | null> {
  const supabase = getServiceSupabase();

  const { data: next, error } = await supabase
    .from("listings")
    .select("*")
    .eq("send_status", "queued")
    .eq("is_excluded", false)
    .order("first_seen_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!next) return null;

  const listing = next as ListingRow;
  const { data: claimed, error: claimError } = await supabase
    .from("listings")
    .update({ send_status: "sending" satisfies SendStatus })
    .eq("id", listing.id)
    .eq("send_status", "queued")
    .select("*")
    .maybeSingle();

  if (claimError) throw new Error(claimError.message);
  return (claimed as ListingRow | null) ?? null;
}

export async function markListingSent(listingId: string): Promise<void> {
  const supabase = getServiceSupabase();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("listings")
    .update({
      send_status: "sent" satisfies SendStatus,
      send_error: null,
      sent_at: now,
      status: "messaged",
      stage_changed_at: now,
    })
    .eq("id", listingId);

  if (error) throw new Error(error.message);

  await supabase.from("listing_events").insert([
    { listing_id: listingId, kind: "send", detail: "Auto-sent via Browserbase" },
    { listing_id: listingId, kind: "stage", detail: "messaged" },
  ]);
}

export async function markListingSendFailed(
  listingId: string,
  detail: string,
): Promise<void> {
  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("listings")
    .update({
      send_status: "failed" satisfies SendStatus,
      send_error: detail.slice(0, 1000),
    })
    .eq("id", listingId);

  if (error) throw new Error(error.message);

  await supabase.from("listing_events").insert({
    listing_id: listingId,
    kind: "send_error",
    detail: detail.slice(0, 1000),
  });
}

export async function markListingSendSkipped(
  listingId: string,
  detail: string,
): Promise<void> {
  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("listings")
    .update({
      send_status: "skipped" satisfies SendStatus,
      send_error: detail.slice(0, 1000),
    })
    .eq("id", listingId);

  if (error) throw new Error(error.message);

  await supabase.from("listing_events").insert({
    listing_id: listingId,
    kind: "send_skipped",
    detail: detail.slice(0, 1000),
  });
}
