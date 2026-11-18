import { NextResponse } from "next/server";
import { runHealthChecks } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public liveness snapshot for the System page (no secrets returned). */
export async function GET() {
  try {
    const report = await runHealthChecks();
    const status =
      report.overall === "error" ? 503 : report.overall === "warn" ? 200 : 200;
    return NextResponse.json(report, { status });
  } catch (error) {
    return NextResponse.json(
      {
        checkedAt: new Date().toISOString(),
        overall: "error",
        checks: [
          {
            id: "health",
            label: "Health runner",
            status: "error",
            detail: error instanceof Error ? error.message : "Unknown error",
            latencyMs: null,
          },
        ],
        queue: null,
      },
      { status: 500 },
    );
  }
}
