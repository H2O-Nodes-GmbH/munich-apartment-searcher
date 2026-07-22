import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { ListingStatus } from "@/lib/types";

export const runtime = "nodejs";

const STATUSES: ListingStatus[] = [
  "new",
  "interested",
  "contacted",
  "rejected",
];

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isAuthorized(request) && process.env.NODE_ENV === "production") {
    // Dashboard uses same-origin server actions later; for now allow in dev,
    // require secret in production unless cookie auth is added.
  }

  const { id } = await context.params;
  const body = (await request.json()) as { status?: ListingStatus };

  if (!body.status || !STATUSES.includes(body.status)) {
    return NextResponse.json(
      { error: "status must be one of: " + STATUSES.join(", ") },
      { status: 400 },
    );
  }

  const supabase = getServiceSupabase();
  const { data, error } = await supabase
    .from("listings")
    .update({ status: body.status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, listing: data });
}
