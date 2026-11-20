import { NextResponse } from "next/server";
import { appPipelineUrl } from "@/lib/appUrl";
import { isAuthorized } from "@/lib/auth";
import { pollActiveSearches, type PollSummary } from "@/lib/poll";
import { runSendQueue, type SendRunResult } from "@/lib/sender/runSendQueue";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Scans per cron minute: at 0s and 30s, so a new listing waits ≤30s to be seen. */
const SCAN_OFFSETS_MS = [0, 30_000];

/**
 * Vercel Cron (every minute) + manual trigger. Scans the searches and sends
 * new listings immediately, so a landlord hears from us within about a minute.
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  const deadline = startedAt + (maxDuration - 20) * 1000;
  const pipelineUrl = appPipelineUrl(request);
  const scans: PollSummary[] = [];
  const sends: SendRunResult[] = [];

  try {
    for (const offset of SCAN_OFFSETS_MS) {
      const wait = startedAt + offset - Date.now();
      // A long send ate into the next scan slot; the next cron run covers it.
      if (wait < -10_000) break;
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));

      const scan = await pollActiveSearches();
      scans.push(scan);
      if (scan.queued > 0) {
        sends.push(await runSendQueue({ deadline, pipelineUrl }));
      }
    }

    return NextResponse.json({
      ok: true,
      polledAt: new Date().toISOString(),
      scans,
      sends,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message, scans, sends }, { status: 500 });
  }
}
