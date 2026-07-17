/**
 * Kleinanzeigen search-result parsers.
 *
 * Inspected against live HTML (Jul 2026):
 *   article.aditem[data-adid][data-href]
 *   .aditem-main--top--left          → location
 *   .aditem-main--top--right         → posted date (present when sorted by date)
 *   a.ellipsis                       → title + path
 *   .aditem-main--middle--description → snippet
 *   .aditem-main--middle--price-shipping--price → price
 *   .aditem-image img[src]           → thumbnail
 *
 * Tip: append ?sortingField=SORTING_DATE (or &sortingField=...) so posted dates appear.
 */

import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import type { ParsedListing } from "./types";

const BASE_URL = "https://www.kleinanzeigen.de";

export function parseListings(html: string): ParsedListing[] {
  const $ = cheerio.load(html);
  const listings: ParsedListing[] = [];

  $("article.aditem").each((_, el) => {
    const listing = parseAdItem($, el);
    if (listing) listings.push(listing);
  });

  return listings;
}

function parseAdItem(
  $: cheerio.CheerioAPI,
  el: AnyNode,
): ParsedListing | null {
  const $el = $(el as Element);
  const externalId = ($el.attr("data-adid") || "").trim();
  if (!externalId) return null;

  const href =
    $el.attr("data-href")?.trim() ||
    $el.find("a.ellipsis").attr("href")?.trim() ||
    $el.find("a[href*='/s-anzeige/']").first().attr("href")?.trim();

  if (!href) return null;

  const title =
    cleanText($el.find("a.ellipsis").first().text()) ||
    cleanText($el.find("h2").first().text());
  if (!title) return null;

  const priceText = cleanText(
    $el.find(".aditem-main--middle--price-shipping--price").first().text(),
  );
  const location = cleanText(
    $el.find(".aditem-main--top--left").first().text(),
  );
  const postedText = cleanText(
    $el.find(".aditem-main--top--right").first().text(),
  );
  const descriptionSnippet = cleanText(
    $el.find(".aditem-main--middle--description").first().text(),
  );

  const thumbnailUrl =
    $el.find(".aditem-image img").first().attr("src")?.trim() ||
    extractLdJsonImage($, $el) ||
    null;

  return {
    externalId,
    title,
    priceText: priceText || null,
    priceEur: parsePriceEur(priceText),
    location: location || null,
    url: href.startsWith("http") ? href : `${BASE_URL}${href}`,
    thumbnailUrl,
    descriptionSnippet: descriptionSnippet || null,
    postedText: postedText || null,
    postedAt: parsePostedAt(postedText),
  };
}

function extractLdJsonImage(
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<Element>,
): string | null {
  const raw = $el.find('script[type="application/ld+json"]').first().text();
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as { contentUrl?: string };
    return data.contentUrl?.trim() || null;
  } catch {
    return null;
  }
}

/** "1.640 €" / "VB" / "1.200 € VB" → number or null */
export function parsePriceEur(priceText: string | null | undefined): number | null {
  if (!priceText) return null;
  const normalized = priceText.replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

/**
 * Parses Kleinanzeigen relative/absolute date strings into Date (local Europe/Berlin intent).
 * Examples: "Heute, 20:57" | "Gestern, 09:12" | "12.07.2026"
 */
export function parsePostedAt(
  postedText: string | null | undefined,
  now: Date = new Date(),
): Date | null {
  if (!postedText) return null;
  const text = postedText.trim();

  const absolute = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (absolute) {
    const day = Number(absolute[1]);
    const month = Number(absolute[2]) - 1;
    const year = Number(absolute[3]);
    const d = new Date(year, month, day);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const relative = text.match(/^(Heute|Gestern),\s*(\d{1,2}):(\d{2})$/i);
  if (relative) {
    const d = new Date(now);
    if (/gestern/i.test(relative[1])) {
      d.setDate(d.getDate() - 1);
    }
    d.setHours(Number(relative[2]), Number(relative[3]), 0, 0);
    return d;
  }

  return null;
}

function cleanText(value: string | undefined): string {
  return (value || "").replace(/\s+/g, " ").trim();
}
