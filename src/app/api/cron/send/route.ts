import { NextResponse } from "next/server";
import { appPipelineUrl } from "@/lib/appUrl";
import { isAuthorized } from "@/lib/auth";
import { runSendQueue } from "@/lib/sender/runSendQueue";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Safety net: the poll cron sends new listings inline; this drains anything left over.
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runSendQueue({
      deadline: Date.now() + (maxDuration - 20) * 1000,
      pipelineUrl: appPipelineUrl(request),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
