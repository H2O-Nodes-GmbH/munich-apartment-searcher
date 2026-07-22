export type ListingStatus = "new" | "interested" | "contacted" | "rejected";

export type SearchConfigRow = {
  id: string;
  name: string;
  search_url: string;
  active: boolean;
  last_polled_at: string | null;
  created_at: string;
};

export type ListingRow = {
  id: string;
  external_id: string;
  search_config_id: string | null;
  title: string;
  price_text: string | null;
  price_eur: number | null;
  location: string | null;
  url: string;
  thumbnail_url: string | null;
  description_snippet: string | null;
  posted_at: string | null;
  posted_text: string | null;
  is_excluded: boolean;
  matched_exclude_terms: string[];
  status: ListingStatus;
  first_seen_at: string;
  last_seen_at: string;
};
