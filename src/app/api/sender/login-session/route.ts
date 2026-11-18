import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import {
  closeSenderSession,
  createBrowserbaseClient,
  openSenderSession,
} from "@/lib/sender/browser";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Start a keep-alive Browserbase session on the persistent context and return
 * a live debugger URL. Log into Kleinanzeigen there as Max, then call
 * GET /api/sender/login-session/complete?sessionId=… so cookies are persisted.
 *
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const session = await openSenderSession({ persist: true, keepAlive: true });
    await session.page.goto("https://www.kleinanzeigen.de/m-einloggen.html", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });

    const debuggerUrl = session.debuggerUrl;
    // Disconnect CDP; keepAlive keeps the cloud browser up for manual login.
    await closeSenderSession(session);

    if (!debuggerUrl) {
      const bb = createBrowserbaseClient();
      await bb.sessions.update(session.sessionId, { status: "REQUEST_RELEASE" }).catch(() => undefined);
      return NextResponse.json(
        { ok: false, error: "No debugger URL from Browserbase" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      sessionId: session.sessionId,
      debuggerUrl,
      completeUrl: `/api/sender/login-session/complete?sessionId=${session.sessionId}`,
      instructions: [
        "Open debuggerUrl and log into Kleinanzeigen as Max.",
        "Confirm you see your account menu / Nachrichten.",
        "Then open completeUrl (with the same CRON_SECRET) to save the session into the Browserbase context.",
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
