import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { pollActiveSearches } from "@/lib/poll";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Vercel Cron + manual trigger.
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await pollActiveSearches({ notify: true });
    return NextResponse.json({
      ok: true,
      polledAt: new Date().toISOString(),
      ...summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
