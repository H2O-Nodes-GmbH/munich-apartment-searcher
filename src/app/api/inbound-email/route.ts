import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
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
} from "@/lib/notifications";
import { stageLabel } from "@/lib/pipeline";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { ListingRow, ListingStatus } from "@/lib/types";

export const runtime = "nodejs";

/** Stages a landlord reply should pull forward to "replied". Later stages stay put. */
const ADVANCE_TO_REPLIED: ListingStatus[] = ["new", "shortlisted", "messaged"];

type PostmarkInbound = {
  From?: string;
  FromFull?: { Email?: string };
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
};

function hasValidToken(request: Request): boolean {
  const expected = process.env.INBOUND_EMAIL_TOKEN;
  const given = new URL(request.url).searchParams.get("token");
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Postmark inbound webhook. Gmail auto-forwards Kleinanzeigen notifications here.
 * Configure in Postmark as: https://<app>/api/inbound-email?token=<INBOUND_EMAIL_TOKEN>
 * Always answers 200 for emails we ignore, so Postmark doesn't retry them.
 */
export async function POST(request: Request) {
  if (!hasValidToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const email = (await request.json()) as PostmarkInbound;
  const from = email.FromFull?.Email ?? email.From ?? "";
  const subject = email.Subject ?? "";
  const text = email.TextBody?.trim() || htmlToText(email.HtmlBody ?? "");
  const notifier = createNotifierFromEnv();

  const confirmation = parseGmailForwardingConfirmation({ from, subject, text });
  if (confirmation) {
    try {
      await notifier?.notifyMessage(
        formatForwardingCodeMessage(confirmation),
      );
    } catch (err) {
      console.error("Failed to send forwarding code to Telegram:", err);
    }
    return NextResponse.json({ ok: true, kind: "gmail-forwarding-confirmation" });
  }

  if (!isKleinanzeigenReply({ from, subject })) {
    return NextResponse.json({ ok: true, kind: "ignored" });
  }

  const reply = parseReplyEmail({ subject, text });
  if (!reply.adId) {
    console.warn("Inbound reply without ad number:", subject);
    return NextResponse.json({ ok: true, kind: "unparsed" });
  }

  const supabase = getServiceSupabase();
  const { data: listing, error } = await supabase
    .from("listings")
    .select("*")
    .eq("external_id", reply.adId)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!listing) {
    // Replies about ads that aren't apartments we track (e.g. things Max sells).
    return NextResponse.json({ ok: true, kind: "unmatched", adId: reply.adId });
  }

  const row = listing as ListingRow;
  const advance = ADVANCE_TO_REPLIED.includes(row.status);
  const now = new Date().toISOString();
  {
    const patch: Record<string, string> = { replied_at: now };
    if (advance) {
      patch.status = "replied";
      patch.stage_changed_at = now;
    }
    const { error: updateError } = await supabase
      .from("listings")
      .update(patch)
      .eq("id", row.id);
    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 500 },
      );
    }
  }

  const detail = [reply.senderName, reply.message ?? "(photos only)"]
    .filter(Boolean)
    .join(": ");
  await supabase.from("listing_events").insert([
    { listing_id: row.id, kind: "reply", detail: detail.slice(0, 2000) },
    ...(advance
      ? [{ listing_id: row.id, kind: "stage", detail: stageLabel("replied") }]
      : []),
  ]);

  try {
    await notifier?.notifyMessage(
      formatReplyMessage({
        senderName: reply.senderName,
        listingTitle: row.title,
        listingUrl: row.url,
        message: reply.message,
        stageNote: advance
          ? `Moved to ${stageLabel("replied")}`
          : `Stage: ${stageLabel(row.status)}`,
        crmUrl: new URL("/pipeline", request.url).toString(),
      }),
    );
  } catch (err) {
    console.error("Failed to send reply notification:", err);
  }

  return NextResponse.json({
    ok: true,
    kind: "reply",
    listingId: row.id,
    advanced: advance,
  });
}
