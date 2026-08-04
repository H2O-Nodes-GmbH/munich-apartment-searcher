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
import { getServiceSupabase } from "@/lib/supabase/server";
import type { ListingStatus } from "@/lib/types";

const STATUSES: ListingStatus[] = [
  "new",
  "interested",
  "contacted",
  "rejected",
];

export async function updateListingStatus(id: string, status: ListingStatus) {
  if (!STATUSES.includes(status)) {
    throw new Error("Invalid status");
  }

  const supabase = getServiceSupabase();
  const { error } = await supabase
    .from("listings")
    .update({ status })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/");
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
