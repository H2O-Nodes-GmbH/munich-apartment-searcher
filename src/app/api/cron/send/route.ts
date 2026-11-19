import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import {
  createNotifierFromEnv,
} from "@/lib/notifications";
import {
  claimNextQueuedListing,
  loadMessageTemplate,
  markListingSendFailed,
  markListingSendSkipped,
  markListingSent,
} from "@/lib/sender/queue";
import { sendListingMessage } from "@/lib/sender/sendListingMessage";
import { renderMessage } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Process one queued listing send per run (spacing comes from cron frequency).
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_CONTEXT_ID) {
    return NextResponse.json(
      { ok: false, error: "Browserbase is not configured" },
      { status: 503 },
    );
  }

  try {
    const listing = await claimNextQueuedListing();
    if (!listing) {
      return NextResponse.json({ ok: true, skipped: true, reason: "Queue empty" });
    }

    const template = await loadMessageTemplate();
    const message =
      listing.message_body?.trim() ||
      renderMessage(template, listing);

    const result = await sendListingMessage({
      listingUrl: listing.url,
      message,
    });

    const pipelineUrl = appPipelineUrl(request);
    const linkLine = [
      `<a href="${escapeHtml(listing.url)}">Listing</a>`,
      `<a href="${escapeHtml(pipelineUrl)}">Pipeline</a>`,
    ].join(" · ");

    if (result.ok) {
      await markListingSent(listing.id);
      const notifier = createNotifierFromEnv();
      await notifier?.notifyMessage(
        [
          "✅ <b>Message sent</b>",
          escapeHtml(listing.title),
          listing.location ? escapeHtml(listing.location) : null,
          "",
          linkLine,
        ]
          .filter((line) => line !== null)
          .join("\n"),
      );
      return NextResponse.json({
        ok: true,
        listingId: listing.id,
        externalId: listing.external_id,
        sessionId: result.sessionId,
        sent: true,
      });
    }

    if (result.reason === "listing_unavailable") {
      await markListingSendSkipped(
        listing.id,
        `${result.reason}: ${result.detail}`,
      );
    } else {
      await markListingSendFailed(
        listing.id,
        `${result.reason}: ${result.detail}`,
      );
    }

    // Only alert on blockers that need human action.
    if (
      result.reason === "login_required" ||
      result.reason === "captcha" ||
      result.reason === "form_changed"
    ) {
      const notifier = createNotifierFromEnv();
      await notifier?.notifyMessage(
        [
          "⚠️ <b>Auto-send blocked</b>",
          escapeHtml(listing.title),
          `${escapeHtml(result.reason)}: ${escapeHtml(result.detail)}`,
          result.sessionId
            ? `Session: <code>${escapeHtml(result.sessionId)}</code>`
            : null,
          "",
          linkLine,
        ]
          .filter((line) => line !== null)
          .join("\n"),
      );
    }

    return NextResponse.json({
      ok: false,
      listingId: listing.id,
      externalId: listing.external_id,
      sessionId: result.sessionId,
      reason: result.reason,
      detail: result.detail,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Stable Pipeline URL for Telegram — prefer production host over ephemeral cron URL. */
function appPipelineUrl(request: Request): string {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null);
  if (configured) {
    return new URL("/pipeline", configured.endsWith("/") ? configured : `${configured}/`)
      .toString();
  }
  return new URL("/pipeline", request.url).toString();
}
