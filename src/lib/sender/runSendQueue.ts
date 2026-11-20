import { createNotifierFromEnv } from "@/lib/notifications";
import { renderMessage } from "@/lib/pipeline";
import {
  acquireSendSlot,
  loadMessageTemplate,
  markListingSendFailed,
  markListingSendSkipped,
  markListingSent,
} from "@/lib/sender/queue";
import { isSendPaused } from "@/lib/sender/sendPause";
import { sendListingMessage } from "@/lib/sender/sendListingMessage";

/** A single Browserbase send can take this long; don't start one with less time left. */
const SEND_BUDGET_MS = 90_000;

export type SendRunResult = {
  sent: number;
  failed: number;
  skipped: number;
  stoppedBecause:
    | "paused"
    | "not_configured"
    | "busy"
    | "queue_empty"
    | "deadline"
    | "blocked";
};

/**
 * Drain the send queue one listing at a time until it's empty or time runs out.
 * Only one runner sends at a time (shared Browserbase context).
 */
export async function runSendQueue(options: {
  deadline: number;
  pipelineUrl: string;
}): Promise<SendRunResult> {
  const result: SendRunResult = { sent: 0, failed: 0, skipped: 0, stoppedBecause: "queue_empty" };

  if (isSendPaused().paused) return { ...result, stoppedBecause: "paused" };
  if (!process.env.BROWSERBASE_API_KEY || !process.env.BROWSERBASE_CONTEXT_ID) {
    return { ...result, stoppedBecause: "not_configured" };
  }

  let template: string | null = null;

  while (Date.now() + SEND_BUDGET_MS < options.deadline) {
    const slot = await acquireSendSlot();
    if (slot.kind === "busy") return { ...result, stoppedBecause: "busy" };
    if (slot.kind === "empty") return { ...result, stoppedBecause: "queue_empty" };
    const listing = slot.listing;

    template ??= await loadMessageTemplate();
    // Always render fresh so keyword hooks stay current for auto-send.
    const message = renderMessage(template, listing);
    const send = await sendListingMessage({ listingUrl: listing.url, message });

    if (send.ok) {
      await markListingSent(listing.id);
      result.sent += 1;
      continue;
    }

    if (send.reason === "listing_unavailable") {
      await markListingSendSkipped(listing.id, `${send.reason}: ${send.detail}`);
      result.skipped += 1;
      continue;
    }

    await markListingSendFailed(listing.id, `${send.reason}: ${send.detail}`);
    result.failed += 1;

    // Immediate alerts only for blockers that need human action.
    if (send.reason === "login_required" || send.reason === "captcha") {
      await createNotifierFromEnv()?.notifyMessage(
        [
          "⚠️ <b>Auto-send blocked</b>",
          escapeHtml(listing.title),
          `${escapeHtml(send.reason)}: ${escapeHtml(send.detail)}`,
          send.sessionId ? `Session: <code>${escapeHtml(send.sessionId)}</code>` : null,
          "",
          [
            `<a href="${escapeHtml(listing.url)}">Listing</a>`,
            `<a href="${escapeHtml(options.pipelineUrl)}">Pipeline</a>`,
          ].join(" · "),
        ]
          .filter((line) => line !== null)
          .join("\n"),
      );
      return { ...result, stoppedBecause: "blocked" };
    }
  }

  return { ...result, stoppedBecause: "deadline" };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
