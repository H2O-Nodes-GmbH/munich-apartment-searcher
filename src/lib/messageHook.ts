/**
 * One short, automated "why we like this listing" sentence for landlord messages.
 * Keyword / trait based — no LLM. First matching rule wins (priority order).
 */

export type HookListing = {
  title: string;
  location?: string | null;
  description_snippet?: string | null;
  price_text?: string | null;
};

type HookRule = {
  id: string;
  test: (haystack: string, listing: HookListing) => boolean;
  sentence: (listing: HookListing, haystack: string) => string;
};

const FALLBACK =
  "Der Zuschnitt und die Lage wirken sehr gut für uns - die Anzeige hat uns direkt angesprochen.";

function districtFromLocation(location: string | null | undefined): string | null {
  if (!location?.trim()) return null;
  // "81241 Pasing-Obermenzing" → "Pasing-Obermenzing"
  const withoutZip = location.replace(/^\d{5}\s+/, "").trim();
  if (!withoutZip || /^münchen$/i.test(withoutZip)) return null;
  // Drop leading "München - " / "München,"
  return withoutZip.replace(/^münchen\s*[-–,]\s*/i, "").trim() || null;
}

function sizeFromText(haystack: string): string | null {
  const m = haystack.match(/(\d{2,3})\s*(?:m²|qm|m2)\b/i);
  return m ? m[1] : null;
}

const RULES: HookRule[] = [
  {
    id: "stellplatz",
    test: (h) =>
      /\bstellplatz|\bgarage|\btiefgarage|\bparkplatz|\bparken\b|\bpkw[- ]?stellplatz/i.test(
        h,
      ),
    sentence: () =>
      "Besonders gut passt uns der Stellplatz - wir haben ein Auto und freuen uns über eine unkomplizierte Parklösung.",
  },
  {
    id: "balkon",
    test: (h) => /\bbalkon|\bterrasse|\bloggia/i.test(h),
    sentence: (_l, h) => {
      const outdoor = /\bterrasse/i.test(h)
        ? "die Terrasse"
        : /\bloggia/i.test(h)
          ? "die Loggia"
          : "der Balkon";
      return `Uns hat besonders ${outdoor} angesprochen - ein Stück Draußen im Alltag wäre für uns ideal.`;
    },
  },
  {
    id: "ebk",
    test: (h) => /\beinbauküche|\bebk\b|\bküche\s+(ist\s+)?vorhanden/i.test(h),
    sentence: () =>
      "Die Einbauküche ist für uns ein echtes Plus - so könnten wir zügig und unkompliziert einziehen.",
  },
  {
    id: "size",
    test: (h) => sizeFromText(h) !== null,
    sentence: (_l, h) => {
      const size = sizeFromText(h);
      return `Die ca. ${size} m² wirken genau richtig für uns beide - weder zu eng noch zu groß.`;
    },
  },
  {
    id: "quiet",
    test: (h) => /\bruhig|\bruhelage|\bruhige\s+lage|\babseits/i.test(h),
    sentence: () =>
      "Die ruhige Lage spricht uns sehr an - nach der Arbeit würden wir uns über einen ruhigen Rückzugsort freuen.",
  },
  {
    id: "central",
    test: (h) =>
      /\bzentral|\bbestlage|\binnenstadtnah|\bgute\s+anbindung|\bnahverkehr|\bu-bahn|\bs-bahn/i.test(
        h,
      ),
    sentence: () =>
      "Die zentrale / gut angebundene Lage passt sehr gut zu unserem Alltag in München.",
  },
  {
    id: "bright",
    test: (h) => /\bhell|\bsonnig|\blichtdurchflutet|\bsüd/i.test(h),
    sentence: () =>
      "Dass die Wohnung hell wirkt, hat uns besonders angesprochen - Licht macht für uns im Alltag einen großen Unterschied.",
  },
  {
    id: "altbau",
    test: (h) => /\baltbau|\bstuck|\bhohe\s+decken/i.test(h),
    sentence: () =>
      "Der Altbau-Charakter der Wohnung spricht uns sehr an - Charme und Charakter sind uns wichtig.",
  },
  {
    id: "district",
    test: (_h, listing) => districtFromLocation(listing.location) !== null,
    sentence: (listing) => {
      const district = districtFromLocation(listing.location);
      return `Vor allem die Lage in ${district} hat uns angesprochen - genau die Gegend, in der wir uns wohlfühlen würden.`;
    },
  },
];

/** Build one German hook sentence from listing title/description/location. */
export function buildMessageHook(listing: HookListing): string {
  const haystack = [
    listing.title,
    listing.description_snippet ?? "",
    listing.location ?? "",
    listing.price_text ?? "",
  ]
    .join("\n")
    .toLowerCase();

  for (const rule of RULES) {
    if (rule.test(haystack, listing)) {
      return rule.sentence(listing, haystack);
    }
  }
  return FALLBACK;
}
