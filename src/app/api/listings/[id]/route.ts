import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { isListingStatus, STATUS_VALUES } from "@/lib/pipeline";
import { getServiceSupabase } from "@/lib/supabase/server";

export const runtime = "nodejs";

/** Auth: Bearer CRON_SECRET. The dashboard uses server actions instead. */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const body = (await request.json()) as { status?: unknown };

  if (!isListingStatus(body.status)) {
    return NextResponse.json(
      { error: "status must be one of: " + STATUS_VALUES.join(", ") },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("listings")
    .update({ status: body.status, stage_changed_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, listing: data });
}
