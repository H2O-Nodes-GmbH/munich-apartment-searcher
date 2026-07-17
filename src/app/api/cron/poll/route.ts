import { NextResponse } from "next/server";

/**
 * Placeholder — wired up after scrape + DB persistence are confirmed.
 * Protected by CRON_SECRET once implemented.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: false,
      error: "Poll cron not implemented yet. Use /api/scrape/test first.",
    },
    { status: 501 },
  );
}
