/**
 * Kleinanzeigen search-result parsers.
 *
 * Current markup (Sep 2026):
 *   #srchrslt-adtable li > article[data-adid][data-href]
 *   h3 a                         → title + path
 *   span matching /^\d{5}\b/     → location
 *   p.my-xsmall.text-title3      → price
 *   p.mb-xsmall.text-bodyRegular → snippet
 *   img[src*="img.kleinanzeigen.de"] or ld+json contentUrl → thumbnail
 *   posted date lives in the page's resultAds JSON as sortingDate
 *
 * Older markup (Jul 2026), still accepted:
 *   article.aditem[data-adid][data-href]
 *   .aditem-main--top--left / --right
 *   a.ellipsis
 *   .aditem-main--middle--description
 *   .aditem-main--middle--price-shipping--price
 *   .aditem-image img[src]
 *
 * Tip: append ?sortingField=SORTING_DATE (or &sortingField=...) so posted dates appear.
 */

import * as cheerio from "cheerio";
import type { AnyNode, Element } from "domhandler";
import type { ParsedListing } from "./types";

const BASE_URL = "https://www.kleinanzeigen.de";

export function parseListings(html: string): ParsedListing[] {
  const $ = cheerio.load(html);
  const postedById = extractPostedDatesFromPage(html);
  const listings: ParsedListing[] = [];
  const seen = new Set<string>();

  $("article[data-adid]").each((_, el) => {
    const listing = parseAdItem($, el, postedById);
    if (!listing || seen.has(listing.externalId)) return;
    seen.add(listing.externalId);
    listings.push(listing);
  });

  return listings;
}

function parseAdItem(
  $: cheerio.CheerioAPI,
  el: AnyNode,
  postedById: Map<string, string>,
): ParsedListing | null {
  const $el = $(el as Element);
  const externalId = ($el.attr("data-adid") || "").trim();
  if (!externalId) return null;

  const href =
    $el.attr("data-href")?.trim() ||
    $el.find("h3 a[href*='/s-anzeige/']").attr("href")?.trim() ||
    $el.find("a.ellipsis").attr("href")?.trim() ||
    $el.find("a[href*='/s-anzeige/']").first().attr("href")?.trim();

  if (!href) return null;

  const ld = extractLdJson($, $el);

  const title =
    cleanText($el.find("h3 a").first().text()) ||
    cleanText($el.find("a.ellipsis").first().text()) ||
    cleanText($el.find("h2").first().text()) ||
    cleanText(ld?.title);
  if (!title) return null;

  const priceText =
    cleanText(
      $el.find(".aditem-main--middle--price-shipping--price").first().text(),
    ) ||
    cleanText($el.find("p.my-xsmall.text-title3").first().text()) ||
    findPriceText($, $el);

  const location =
    cleanText($el.find(".aditem-main--top--left").first().text()) ||
    findZipLocation($, $el);

  const postedText =
    cleanText($el.find(".aditem-main--top--right").first().text()) ||
    postedById.get(externalId) ||
    null;

  const descriptionSnippet =
    cleanText($el.find(".aditem-main--middle--description").first().text()) ||
    cleanText($el.find("p.mb-xsmall.text-bodyRegular").first().text()) ||
    cleanText(ld?.description);

  const thumbnailUrl =
    $el.find(".aditem-image img").first().attr("src")?.trim() ||
    $el
      .find('img[src*="img.kleinanzeigen.de"]')
      .first()
      .attr("src")
      ?.trim() ||
    ld?.contentUrl?.trim() ||
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

function findZipLocation(
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<Element>,
): string {
  let location = "";
  $el.find("span").each((_, span) => {
    const text = cleanText($(span).text());
    if (/^\d{5}\b/.test(text)) {
      location = text;
      return false;
    }
  });
  return location;
}

function findPriceText(
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<Element>,
): string {
  let price = "";
  $el.find("p").each((_, p) => {
    const text = cleanText($(p).text());
    if (/€|\bVB\b/i.test(text)) {
      price = text;
      return false;
    }
  });
  return price;
}

type LdJson = {
  title?: string;
  description?: string;
  contentUrl?: string;
};

function extractLdJson(
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<Element>,
): LdJson | null {
  const raw = $el.find('script[type="application/ld+json"]').first().text();
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LdJson;
  } catch {
    return null;
  }
}

/**
 * New search pages hide the posted date in resultAds JSON, not on the card.
 * Example: "id":[0,3504675034] … "sortingDate":[0,"Gestern, 22:56"]
 */
function extractPostedDatesFromPage(html: string): Map<string, string> {
  const dates = new Map<string, string>();
  const decoded = html
    .replaceAll("&quot;", '"')
    .replaceAll("&#34;", '"');

  const re =
    /"id":\[0,(\d+)\][\s\S]{0,6000}?"sortingDate":\[0,"((?:Heute|Gestern),\s*\d{1,2}:\d{2}|\d{1,2}\.\d{1,2}\.\d{4})"\]/g;

  for (const match of decoded.matchAll(re)) {
    if (!dates.has(match[1])) dates.set(match[1], match[2]);
  }
  return dates;
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

function cleanText(value: string | undefined | null): string {
  return (value || "").replace(/\s+/g, " ").trim();
}
