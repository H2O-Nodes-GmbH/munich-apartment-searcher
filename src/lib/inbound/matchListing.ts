import type { SupabaseClient } from "@supabase/supabase-js";
import type { ListingRow } from "@/lib/types";

/** How far back a reply can reference a listing we messaged. */
const SENT_LOOKBACK_DAYS = 45;

export type InquiryConfirmation = {
  source: "kleinanzeigen" | "ohne-makler";
  adId: string | null;
  postcode: string | null;
};

/**
 * Delivery receipts for an inquiry we sent (not landlord replies):
 * - Kleinanzeigen: "Vielen Dank für deine Immobilienanfrage!"
 * - ohne-makler: "Ihre Anfrage wurde dem Vermieter der Wohnung in 81737 München zugestellt."
 */
export function parseInquiryConfirmation(input: {
  from: string;
  text: string;
  html: string;
}): InquiryConfirmation | null {
  let source: InquiryConfirmation["source"] | null = null;
  if (/Vielen Dank für deine Immobilienanfrage/i.test(input.text)) {
    source = "kleinanzeigen";
  } else if (
    /ohne-makler/i.test(input.from) &&
    /Anfrage wurde dem Vermieter[\s\S]{0,120}zugestellt/i.test(input.text)
  ) {
    source = "ohne-makler";
  }
  if (!source) return null;

  return {
    source,
    adId: extractAdId(`${input.html}\n${input.text}`),
    postcode: extractPostcode(input.text),
  };
}

export function extractAdId(raw: string): string | null {
  return (
    raw.match(/\/s-anzeige\/[^"'\s<>]*?\/(\d{6,})(?:-\d+-\d+)?/)?.[1] ??
    raw.match(/Anzeigennummer:\s*(\d{6,})/i)?.[1] ??
    null
  );
}

/** Munich-area postcodes (80xxx–85xxx). */
export function extractPostcode(text: string): string | null {
  return text.match(/\b(8[0-5]\d{3})\b/)?.[1] ?? null;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[„“”"'’–—-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type Candidate = Pick<
  ListingRow,
  "id" | "title" | "url" | "location" | "status" | "external_id" | "send_status" | "sent_at"
>;

/**
 * Find the listing an email is about: ad number first, then title text,
 * then a postcode that matches exactly one recently messaged listing.
 */
export async function findListingForEmail(
  supabase: SupabaseClient,
  input: {
    adId: string | null;
    subject: string;
    text: string;
    allowPostcodeOnly: boolean;
    recentSendWindowMinutes?: number;
  },
): Promise<Candidate | null> {
  const columns =
    "id,title,url,location,status,external_id,send_status,sent_at";

  if (input.adId) {
    const { data } = await supabase
      .from("listings")
      .select(columns)
      .eq("external_id", input.adId)
      .maybeSingle();
    if (data) return data as Candidate;
  }

  const since = new Date(
    Date.now() - SENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data: sent } = await supabase
    .from("listings")
    .select(columns)
    .eq("send_status", "sent")
    .gte("sent_at", since);
  const candidates = (sent ?? []) as Candidate[];
  if (candidates.length === 0) return null;

  const haystack = normalize(`${input.subject}\n${input.text}`);
  const byTitle = candidates.filter((c) => {
    const title = normalize(c.title);
    // Emails often truncate long titles, so a 35-char prefix is enough.
    return haystack.includes(title) || (title.length > 35 && haystack.includes(title.slice(0, 35)));
  });
  if (byTitle.length === 1) return byTitle[0];

  if (!input.allowPostcodeOnly) return null;
  const postcode = extractPostcode(`${input.subject}\n${input.text}`);
  if (!postcode) return null;
  const byPostcode = candidates.filter((c) => c.location?.startsWith(postcode));
  if (byPostcode.length === 1) return byPostcode[0];
  if (!input.recentSendWindowMinutes) return null;

  // Receipts arrive minutes after sending, which disambiguates shared postcodes.
  const windowStart = Date.now() - input.recentSendWindowMinutes * 60 * 1000;
  const recent = byPostcode.filter(
    (c) => c.sent_at && new Date(c.sent_at).getTime() >= windowStart,
  );
  return recent.length === 1 ? recent[0] : null;
}

/** Drop quoted history and signatures-ish tails from a plain email reply. */
export function extractReplyBody(text: string): string | null {
  const body = text
    .replace(/\r\n/g, "\n")
    .split(
      /\n(?:>|Am .{4,120}schrieb|On .{4,120}wrote|-{2,}\s*Original|-{5,} Forwarded|Von:\s|From:\s|Gesendet von)/i,
    )[0]
    ?.trim();
  return body ? body.slice(0, 1500) : null;
}

/** Mentions that make a non-Kleinanzeigen email plausibly about an apartment. */
export function looksApartmentRelated(text: string): boolean {
  return /Wohnung|Besichtigung|Anfrage|Mietvertrag|Vermiet|Miete\b|Objekt/i.test(text);
}
