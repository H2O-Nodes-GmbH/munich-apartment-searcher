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
  listings: Array<
    Pick<
      ListingRow,
      "id" | "title" | "price_text" | "location" | "url" | "description_snippet"
    >
  >,
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

/** A "sending" row older than this belongs to a run that died mid-send. */
const STALE_SENDING_MS = 5 * 60 * 1000;

/**
 * Claim the next queued listing, unless another runner is mid-send
 * (one Browserbase context can't safely drive two sessions).
 * While sending, sent_at holds the claim time.
 */
export async function acquireSendSlot(): Promise<
  { kind: "claimed"; listing: ListingRow } | { kind: "busy" } | { kind: "empty" }
> {
  const supabase = getServiceSupabase();
  const staleBefore = new Date(Date.now() - STALE_SENDING_MS).toISOString();

  const { data: sending, error: sendingError } = await supabase
    .from("listings")
    .select("id,sent_at")
    .eq("send_status", "sending");
  if (sendingError) throw new Error(sendingError.message);

  for (const row of sending ?? []) {
    if (row.sent_at && row.sent_at > staleBefore) return { kind: "busy" };
    // Don't retry: the message may have gone out before the run died.
    await markListingSendFailed(row.id as string, "interrupted: send run ended mid-send");
  }

  const { data: next, error } = await supabase
    .from("listings")
    .select("id")
    .eq("send_status", "queued")
    .eq("is_excluded", false)
    .order("first_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!next) return { kind: "empty" };

  const { data: claimed, error: claimError } = await supabase
    .from("listings")
    .update({
      send_status: "sending" satisfies SendStatus,
      sent_at: new Date().toISOString(),
    })
    .eq("id", next.id)
    .eq("send_status", "queued")
    .select("*")
    .maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (!claimed) return { kind: "busy" };

  // Two runners can claim in the same instant; the earliest claim wins.
  const { data: racing } = await supabase
    .from("listings")
    .select("id,sent_at")
    .eq("send_status", "sending")
    .order("sent_at", { ascending: true })
    .order("id", { ascending: true });
  if ((racing ?? []).length > 1 && racing?.[0]?.id !== claimed.id) {
    await supabase
      .from("listings")
      .update({ send_status: "queued" satisfies SendStatus, sent_at: null })
      .eq("id", claimed.id);
    return { kind: "busy" };
  }

  return { kind: "claimed", listing: claimed as ListingRow };
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
      sent_at: null,
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
      sent_at: null,
    })
    .eq("id", listingId);

  if (error) throw new Error(error.message);

  await supabase.from("listing_events").insert({
    listing_id: listingId,
    kind: "send_skipped",
    detail: detail.slice(0, 1000),
  });
}
