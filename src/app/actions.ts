"use server";

import { revalidatePath } from "next/cache";
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
