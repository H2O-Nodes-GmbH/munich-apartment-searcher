import { NextResponse } from "next/server";
import { appPipelineUrl } from "@/lib/appUrl";
import { isAuthorized } from "@/lib/auth";
import {
  createNotifierFromEnv,
  formatSendSummaryMessage,
} from "@/lib/notifications";
import { getServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

const TARGET_HOUR_BERLIN = 11;

/**
 * Vercel Cron is UTC-only, so this route is scheduled at 09:00 and 10:00 UTC
 * (see vercel.json). Whichever run lands on 11:00 Europe/Berlin sends;
 * the other is a no-op. Self-corrects across DST.
 */
function isElevenAmBerlin(now: Date): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  return hour === TARGET_HOUR_BERLIN;
}

/**
 * Daily Telegram digest of landlord messages sent in the last 24 hours.
 * Auth: Authorization: Bearer <CRON_SECRET>
 * Manual: ?force=1
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";
  const now = new Date();

  if (!force && !isElevenAmBerlin(now)) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Not 11am Europe/Berlin",
    });
  }

  try {
    const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const supabase = getServiceSupabase();
    const { data, error } = await supabase
      .from("listings")
      .select("title, location, url, sent_at")
      .eq("send_status", "sent")
      .gte("sent_at", since)
      .order("sent_at", { ascending: true });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const listings = (data ?? [])
      .filter((row): row is typeof row & { sent_at: string } => Boolean(row.sent_at))
      .map((row) => ({
        title: row.title as string,
        location: (row.location as string | null) ?? null,
        url: row.url as string,
        sentAt: row.sent_at,
      }));

    const pipelineUrl = appPipelineUrl(request);
    const text = formatSendSummaryMessage({ listings, pipelineUrl });
    const notifier = createNotifierFromEnv();
    if (notifier) {
      await notifier.notifyMessage(text);
    }

    return NextResponse.json({
      ok: true,
      sent: listings.length,
      notified: Boolean(notifier),
      berlinHour: TARGET_HOUR_BERLIN,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
