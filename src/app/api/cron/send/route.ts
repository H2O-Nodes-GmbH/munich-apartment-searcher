import { NextResponse } from "next/server";
import { appPipelineUrl } from "@/lib/appUrl";
import { isAuthorized } from "@/lib/auth";
import { createNotifierFromEnv } from "@/lib/notifications";
import {
  claimNextQueuedListing,
  loadMessageTemplate,
  markListingSendFailed,
  markListingSendSkipped,
  markListingSent,
} from "@/lib/sender/queue";
import { isSendPaused } from "@/lib/sender/sendPause";
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

  const pause = isSendPaused();
  if (pause.paused) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Send paused",
      until: pause.until?.toISOString() ?? null,
    });
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
    // Always render fresh so keyword hooks stay current for auto-send.
    const message = renderMessage(template, listing);

    const result = await sendListingMessage({
      listingUrl: listing.url,
      message,
    });

    if (result.ok) {
      await markListingSent(listing.id);
      // Successes are batched into the 11:00 Europe/Berlin daily summary cron.
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

    // Immediate alerts only for blockers that need human action.
    if (result.reason === "login_required" || result.reason === "captcha") {
      const pipelineUrl = appPipelineUrl(request);
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
          [
            `<a href="${escapeHtml(listing.url)}">Listing</a>`,
            `<a href="${escapeHtml(pipelineUrl)}">Pipeline</a>`,
          ].join(" · "),
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
