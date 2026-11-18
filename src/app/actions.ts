"use server";

import { revalidatePath } from "next/cache";
import {
  formatSearchFilterChips,
  parseKleinanzeigenSearchUrl,
} from "@/lib/kleinanzeigen/parseSearchUrl";
import {
  createNotifierFromEnv,
  formatSearchChangeMessage,
} from "@/lib/notifications";
import {
  APP_TIME_ZONE,
  fromBerlinInputValue,
  isListingStatus,
  stageLabel,
} from "@/lib/pipeline";
import { getServiceSupabase } from "@/lib/supabase/server";
import type { ListingStatus } from "@/lib/types";

const MESSAGE_TEMPLATE_ID = "default";

function revalidateDashboards() {
  revalidatePath("/");
  revalidatePath("/pipeline");
}

async function logListingEvent(
  listingId: string,
  kind: string,
  detail: string | null,
) {
  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("listing_events")
    .insert({ listing_id: listingId, kind, detail });
  if (error) console.error("Failed to log listing event:", error.message);
}

export async function updateListingStatus(id: string, status: ListingStatus) {
  if (!isListingStatus(status)) {
    throw new Error("Invalid status");
  }

  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("listings")
    .update({ status, stage_changed_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(error.message);
  await logListingEvent(id, "stage", stageLabel(status));
  revalidateDashboards();
}

export async function updateListingDetails(
  id: string,
  input: { notes: string; viewingAt: string },
) {
  const notes = input.notes.trim() || null;
  const viewingAt = input.viewingAt
    ? fromBerlinInputValue(input.viewingAt)
    : null;
  if (input.viewingAt && !viewingAt) {
    throw new Error("Invalid viewing date");
  }

  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("listings")
    .update({ notes, viewing_at: viewingAt?.toISOString() ?? null })
    .eq("id", id);

  if (error) throw new Error(error.message);
  if (viewingAt) {
    await logListingEvent(
      id,
      "viewing",
      viewingAt.toLocaleString("de-DE", { timeZone: APP_TIME_ZONE }),
    );
  }
  revalidateDashboards();
}

export async function saveMessageTemplate(body: string) {
  const trimmed = body.trim();
  if (!trimmed) throw new Error("Template can't be empty");

  const supabase = getServiceSupabase();
  const { error } = await supabase.from("message_templates").upsert({
    id: MESSAGE_TEMPLATE_ID,
    body: trimmed,
    updated_at: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/pipeline");
}

export async function createSearchConfig(input: {
  name: string;
  searchUrl: string;
}) {
  const name = input.name.trim();
  const searchUrl = input.searchUrl.trim();
  if (!name || !searchUrl) {
    throw new Error("Name and search URL are required");
  }

  const supabase = getServiceSupabase();
  const { error } = await supabase.from("search_configs").insert({
    name,
    search_url: searchUrl,
    active: true,
  });

  if (error) throw new Error(error.message);

  await notifySearchChange({
    action: "added",
    name,
    searchUrl,
  });

  revalidatePath("/");
}

export async function setSearchConfigActive(id: string, active: boolean) {
  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("search_configs")
    .update({ active })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/");
}

export async function deleteSearchConfig(id: string) {
  const supabase = getServiceSupabase();
  const { data: existing, error: fetchError } = await supabase
    .from("search_configs")
    .select("name, search_url")
    .eq("id", id)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);

  const { error } = await supabase.from("search_configs").delete().eq("id", id);

  if (error) throw new Error(error.message);

  if (existing) {
    await notifySearchChange({
      action: "removed",
      name: existing.name as string,
      searchUrl: existing.search_url as string,
    });
  }

  revalidatePath("/");
}

async function notifySearchChange(input: {
  action: "added" | "removed";
  name: string;
  searchUrl: string;
}) {
  const notifier = createNotifierFromEnv();
  if (!notifier) return;

  const chips = formatSearchFilterChips(
    parseKleinanzeigenSearchUrl(input.searchUrl),
  );
  const filtersSummary =
    chips.length > 0
      ? chips.map((c) => `${c.label}: ${c.value}`).join(" · ")
      : "no parsed filters";

  try {
    await notifier.notifyMessage(
      formatSearchChangeMessage({ ...input, filtersSummary }),
    );
  } catch (err) {
    console.error("Failed to notify search change:", err);
  }
}
