/**
 * Parsers for Kleinanzeigen listing detail pages.
 *
 * Inspected against live HTML (Aug–Sep 2026):
 *   1) Structured: li.addetailslist--detail → "Verfügbar ab" / "Bezugsfrei ab"
 *   2) Fallback: #viewad-description-text / itemprop=description free text
 *   3) Seller box: .userprofile-vip-details-text → "Aktiv seit 05.02.2012"
 */

import * as cheerio from "cheerio";
import type { Element } from "domhandler";

const AVAILABILITY_LABELS = /^(verfügbar ab|bezugsfrei ab)$/i;

/**
 * Date-ish capture after an availability cue.
 * Examples: "01.09.", "01.09.2026", "September 2026", "sofort", "sofort / nach Vereinbarung"
 */
const DATE_OR_RELATIVE =
  "(sofort(?:\\s*/\\s*nach\\s+vereinbarung)?|" +
  "nach\\s+vereinbarung|" +
  "\\d{1,2}\\.\\d{1,2}\\.(?:\\d{2,4})?|" +
  "(?:januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\\s*\\d{0,4})";

/** Labeled availability cues in free text (description / title-ish). */
const DESCRIPTION_PATTERNS: RegExp[] = [
  new RegExp(
    `\\b(?:wohnung\\s+)?verfügbar\\s+ab\\s*:?\\s*(${DATE_OR_RELATIVE})`,
    "i",
  ),
  new RegExp(`\\bbezugsfrei\\s+ab\\s*:?\\s*(${DATE_OR_RELATIVE})`, "i"),
  new RegExp(`\\beinzug\\s+ab\\s*:?\\s*(${DATE_OR_RELATIVE})`, "i"),
  new RegExp(`\\bnachmieter\\s+ab\\s*:?\\s*(${DATE_OR_RELATIVE})`, "i"),
  new RegExp(`\\bfrei\\s+ab\\s*:?\\s*(${DATE_OR_RELATIVE})`, "i"),
  new RegExp(`\\bbezug\\s+ab\\s*:?\\s*(${DATE_OR_RELATIVE})`, "i"),
  /\b(sofort\s+verf[üu]gbar|verf[üu]gbar\s+ab\s+sofort|ab\s+sofort\s+verf[üu]gbar)\b/i,
];

/**
 * Reads move-in / availability: structured field first, then description text.
 */
export function parseAvailableFrom(html: string): string | null {
  const $ = cheerio.load(html);

  const fromDetails = parseFromDetailsList($);
  if (fromDetails) return fromDetails;

  const description = cleanText(
    $("#viewad-description-text").first().text() ||
      $('[itemprop="description"]').first().text() ||
      $("#viewad-description").first().text(),
  );

  return parseFromDescription(description);
}

/** Calendar date the seller joined, from "Aktiv seit 05.02.2012". YYYY-MM-DD or null. */
export function parseSellerActiveSince(html: string): string | null {
  const $ = cheerio.load(html);
  const snippets = $(".userprofile-vip-details-text")
    .toArray()
    .map((el) => cleanText($(el).text()));

  for (const snippet of snippets) {
    const parsed = parseAktivSeitText(snippet);
    if (parsed) return parsed;
  }

  const bodyMatch = cleanText($.root().text()).match(
    /\bAktiv seit\s+(\d{1,2})\.(\d{1,2})\.(\d{4})\b/i,
  );
  if (bodyMatch) {
    return toIsoDate(Number(bodyMatch[1]), Number(bodyMatch[2]), Number(bodyMatch[3]));
  }

  return null;
}

export function parseAktivSeitText(text: string): string | null {
  const match = cleanText(text).match(
    /Aktiv seit\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/i,
  );
  if (!match) return null;
  return toIsoDate(Number(match[1]), Number(match[2]), Number(match[3]));
}

function toIsoDate(day: number, month: number, year: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseFromDetailsList($: cheerio.CheerioAPI): string | null {
  let availableFrom: string | null = null;

  $("li.addetailslist--detail").each((_, el) => {
    const $el = $(el as Element);
    const value = cleanText(
      $el.find(".addetailslist--detail--value").first().text(),
    );
    if (!value) return;

    const label = cleanText($el.text().replace(value, ""));
    if (AVAILABILITY_LABELS.test(label)) {
      availableFrom = normalizeAvailability(value);
      return false;
    }
  });

  return availableFrom;
}

/** Exported for focused testing of description heuristics. */
export function parseFromDescription(
  description: string | null | undefined,
): string | null {
  if (!description) return null;
  const text = cleanText(description);
  if (!text) return null;

  for (const pattern of DESCRIPTION_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    // Patterns with a capture group → use group; else whole match (e.g. "sofort verfügbar").
    const raw = (match[1] ?? match[0]).trim();
    const normalized = normalizeAvailability(raw);
    if (normalized) return normalized;
  }

  return null;
}

function normalizeAvailability(value: string): string | null {
  let v = cleanText(value);
  if (!v) return null;

  // Collapse "ab sofort" variants to a short label.
  if (/^(ab\s+)?sofort\b/i.test(v) || /sofort\s+verf[üu]gbar/i.test(v)) {
    if (/nach\s+vereinbarung/i.test(v)) return "sofort / nach Vereinbarung";
    return "sofort";
  }

  // Trim trailing punctuation leftover from sentence context.
  v = v.replace(/[–—,:;.]+$/g, "").trim();
  return v || null;
}

function cleanText(value: string | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}
