import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appPipelineUrl } from "@/lib/appUrl";
import {
  extractReplyBody,
  findListingForEmail,
  looksApartmentRelated,
  parseInquiryConfirmation,
} from "@/lib/inbound/matchListing";
import {
  htmlToText,
  isKleinanzeigenReply,
  parseGmailForwardingConfirmation,
  parseReplyEmail,
} from "@/lib/kleinanzeigen/parseReplyEmail";
import {
  createNotifierFromEnv,
  formatForwardingCodeMessage,
  formatReplyMessage,
  type Notifier,
} from "@/lib/notifications";
import { stageLabel } from "@/lib/pipeline";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { ListingRow, ListingStatus } from "@/lib/types";

export const runtime = "nodejs";

/** Stages a landlord reply should pull forward to "replied". Later stages stay put. */
const ADVANCE_TO_REPLIED: ListingStatus[] = ["new", "shortlisted", "messaged"];

/** Stages a confirmed inquiry should pull forward to "messaged". */
const ADVANCE_TO_MESSAGED: ListingStatus[] = ["new", "shortlisted"];

type PostmarkInbound = {
  From?: string;
  FromName?: string;
  FromFull?: { Email?: string; Name?: string };
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
};

type MatchedListing = Pick<ListingRow, "id" | "title" | "url" | "status" | "send_status" | "sent_at">;

function hasValidToken(request: Request): boolean {
  const expected = process.env.INBOUND_EMAIL_TOKEN;
  const given = new URL(request.url).searchParams.get("token");
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Postmark inbound webhook. Gmail forwards apartment-related mail here:
 * Kleinanzeigen chat replies, inquiry confirmations, and agency/portal replies.
 * Configure in Postmark as: https://<app>/api/inbound-email?token=<INBOUND_EMAIL_TOKEN>
 * Always answers 200 for emails we ignore, so Postmark doesn't retry them.
 */
export async function POST(request: Request) {
  if (!hasValidToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = (await request.json()) as PostmarkInbound;
  const from = email.FromFull?.Email ?? email.From ?? "";
  const fromName = email.FromFull?.Name || email.FromName || null;
  const subject = email.Subject ?? "";
  const html = email.HtmlBody ?? "";
  const text = email.TextBody?.trim() || htmlToText(html);
  const notifier = createNotifierFromEnv();

  const forwarding = parseGmailForwardingConfirmation({ from, subject, text });
  if (forwarding) {
    try {
      await notifier?.notifyMessage(formatForwardingCodeMessage(forwarding));
    } catch (err) {
      console.error("Failed to send forwarding code to Telegram:", err);
    }
    return NextResponse.json({ ok: true, kind: "gmail-forwarding-confirmation" });
  }

  const supabase = getServiceSupabase();

  const confirmation = parseInquiryConfirmation({ from, text, html });
  if (confirmation) {
    const listing = await findListingForEmail(supabase, {
      adId: confirmation.adId,
      subject,
      text,
      allowPostcodeOnly: true,
      recentSendWindowMinutes: 30,
    });
    if (!listing) {
      console.warn("Inquiry confirmation unmatched", { from, subject, ...confirmation });
      return NextResponse.json({ ok: true, kind: "confirmation-unmatched" });
    }
    await recordConfirmedSend(supabase, listing, confirmation.source);
    console.info("Inquiry confirmed", { listingId: listing.id, source: confirmation.source });
    return NextResponse.json({ ok: true, kind: "confirmation", listingId: listing.id });
  }

  if (isKleinanzeigenReply({ from, subject, text })) {
    const reply = parseReplyEmail({ subject, text });
    if (!reply.senderName || !reply.message) {
      console.warn("KA reply parsed partially", {
        senderName: reply.senderName,
        hasMessage: Boolean(reply.message),
        textExcerpt: text.slice(0, 2000),
      });
    }
    const listing = await findListingForEmail(supabase, {
      adId: reply.adId,
      subject,
      text,
      allowPostcodeOnly: false,
    });
    if (!listing) {
      // Replies about ads that aren't apartments we track (e.g. things Max sells).
      console.warn("Inbound KA reply unmatched", { adId: reply.adId, subject });
      return NextResponse.json({ ok: true, kind: "unmatched", adId: reply.adId });
    }
    return recordReply({
      supabase,
      notifier,
      request,
      listing,
      senderName: reply.senderName,
      message: reply.message,
    });
  }

  // Agencies and portals (e.g. ohne-makler) reply from their own addresses.
  if (looksApartmentRelated(`${subject}\n${text}`)) {
    const listing = await findListingForEmail(supabase, {
      adId: null,
      subject,
      text,
      allowPostcodeOnly: true,
    });
    if (listing) {
      return recordReply({
        supabase,
        notifier,
        request,
        listing,
        senderName: fromName ?? from,
        message: extractReplyBody(text),
      });
    }
  }

  console.info("Inbound ignored", { from, subject: subject.slice(0, 160) });
  return NextResponse.json({ ok: true, kind: "ignored" });
}

async function recordConfirmedSend(
  supabase: SupabaseClient,
  listing: MatchedListing,
  source: string,
): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, string | null> = {};
  if (listing.send_status !== "sent") {
    patch.send_status = "sent";
    patch.send_error = null;
  }
  if (!listing.sent_at) patch.sent_at = now;
  const advance = ADVANCE_TO_MESSAGED.includes(listing.status);
  if (advance) {
    patch.status = "messaged";
    patch.stage_changed_at = now;
  }
  if (Object.keys(patch).length > 0) {
    await supabase.from("listings").update(patch).eq("id", listing.id);
  }
  await supabase.from("listing_events").insert([
    {
      listing_id: listing.id,
      kind: "send_confirmed",
      detail: `Inquiry confirmed by ${source}`,
    },
    ...(advance
      ? [{ listing_id: listing.id, kind: "stage", detail: stageLabel("messaged") }]
      : []),
  ]);
}

async function recordReply(input: {
  supabase: SupabaseClient;
  notifier: Notifier | null;
  request: Request;
  listing: MatchedListing;
  senderName: string | null;
  message: string | null;
}): Promise<NextResponse> {
  const { supabase, listing } = input;
  const advance = ADVANCE_TO_REPLIED.includes(listing.status);
  const now = new Date().toISOString();

  const patch: Record<string, string> = { replied_at: now };
  if (advance) {
    patch.status = "replied";
    patch.stage_changed_at = now;
  }
  const { error: updateError } = await supabase
    .from("listings")
    .update(patch)
    .eq("id", listing.id);
  if (updateError) {
    return NextResponse.json({ ok: false, error: updateError.message }, { status: 500 });
  }

  const detail = [input.senderName, input.message ?? "(photos only)"]
    .filter(Boolean)
    .join(": ");
  await supabase.from("listing_events").insert([
    { listing_id: listing.id, kind: "reply", detail: detail.slice(0, 2000) },
    ...(advance
      ? [{ listing_id: listing.id, kind: "stage", detail: stageLabel("replied") }]
      : []),
  ]);

  try {
    await input.notifier?.notifyMessage(
      formatReplyMessage({
        senderName: input.senderName,
        listingTitle: listing.title,
        listingUrl: listing.url,
        message: input.message,
        stageNote: advance
          ? `Moved to ${stageLabel("replied")}`
          : `Stage: ${stageLabel(listing.status)}`,
        crmUrl: appPipelineUrl(input.request),
      }),
    );
  } catch (err) {
    console.error("Failed to send reply notification:", err);
  }

  console.info("Inbound reply recorded", { listingId: listing.id, advanced: advance });
  return NextResponse.json({
    ok: true,
    kind: "reply",
    listingId: listing.id,
    advanced: advance,
  });
}
