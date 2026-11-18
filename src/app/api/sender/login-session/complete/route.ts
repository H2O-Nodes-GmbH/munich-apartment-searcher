import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { createBrowserbaseClient } from "@/lib/sender/browser";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * End a keep-alive login session so Browserbase persists cookies into the context.
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionId = new URL(request.url).searchParams.get("sessionId")?.trim();
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId required" }, { status: 400 });
  }

  try {
    const bb = createBrowserbaseClient();
    await bb.sessions.update(sessionId, { status: "REQUEST_RELEASE" });
    // Give Browserbase a moment to flush context before the next send.
    await new Promise((r) => setTimeout(r, 3_000));
    return NextResponse.json({ ok: true, sessionId, persisted: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
