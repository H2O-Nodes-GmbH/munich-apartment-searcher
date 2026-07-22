export type ParsedSearchFilters = {
  category: string | null;
  location: string | null;
  minPriceEur: number | null;
  maxPriceEur: number | null;
  minSqm: number | null;
  maxSqm: number | null;
  minRooms: number | null;
  maxRooms: number | null;
  radiusKm: number | null;
  sortByDate: boolean;
};

export type SearchFilterChip = {
  label: string;
  value: string;
};

/** Human-readable labels for Kleinanzeigen search URL parts. */
export function parseKleinanzeigenSearchUrl(url: string): ParsedSearchFilters {
  const empty: ParsedSearchFilters = {
    category: null,
    location: null,
    minPriceEur: null,
    maxPriceEur: null,
    minSqm: null,
    maxSqm: null,
    minRooms: null,
    maxRooms: null,
    radiusKm: null,
    sortByDate: false,
  };

  try {
    const parsed = new URL(url);
    const path = decodeURIComponent(parsed.pathname);

    const categoryLocation = path.match(/\/s-([^/]+)\/([^/]+)/);
    if (categoryLocation) {
      empty.category = slugToLabel(categoryLocation[1]);
      empty.location = slugToLabel(categoryLocation[2]);
    }

    const maxPriceOnly = path.match(/preis::(\d+)/);
    if (maxPriceOnly) empty.maxPriceEur = Number(maxPriceOnly[1]);

    const priceRange = path.match(/preis:(\d+):(\d+)/);
    if (priceRange) {
      empty.minPriceEur = Number(priceRange[1]);
      empty.maxPriceEur = Number(priceRange[2]);
    }

    const attrBlob = path.split("+").slice(1).join("+");

    const minSqm = attrBlob.match(/qm_d:(\d+)/);
    if (minSqm) empty.minSqm = Number(minSqm[1]);

    const sqmRange = attrBlob.match(/(?:^|[+,])qm:(\d+):(\d+)/);
    if (sqmRange) {
      empty.minSqm = Number(sqmRange[1]);
      empty.maxSqm = Number(sqmRange[2]);
    }

    const minRooms = attrBlob.match(/zimmer_d:(\d+)/);
    if (minRooms) empty.minRooms = Number(minRooms[1]);

    const roomsRange = attrBlob.match(/(?:^|[+,])zimmer:(\d+):(\d+)/);
    if (roomsRange) {
      empty.minRooms = Number(roomsRange[1]);
      empty.maxRooms = Number(roomsRange[2]);
    }

    const radius = parsed.searchParams.get("radius");
    if (radius) empty.radiusKm = Number(radius);

    empty.sortByDate =
      parsed.searchParams.get("sortingField") === "SORTING_DATE";
    return empty;
  } catch {
    return empty;
  }
}

export function formatSearchFilterChips(
  filters: ParsedSearchFilters,
): SearchFilterChip[] {
  const chips: SearchFilterChip[] = [];

  if (filters.category) chips.push({ label: "Category", value: filters.category });
  if (filters.location) chips.push({ label: "Location", value: filters.location });

  if (filters.minPriceEur != null && filters.maxPriceEur != null) {
    chips.push({
      label: "Rent",
      value: `€${formatNum(filters.minPriceEur)} – €${formatNum(filters.maxPriceEur)}`,
    });
  } else if (filters.maxPriceEur != null) {
    chips.push({ label: "Max rent", value: `€${formatNum(filters.maxPriceEur)}` });
  } else if (filters.minPriceEur != null) {
    chips.push({ label: "Min rent", value: `€${formatNum(filters.minPriceEur)}` });
  }

  if (filters.minSqm != null && filters.maxSqm != null) {
    chips.push({
      label: "Size",
      value: `${filters.minSqm}–${filters.maxSqm} m²`,
    });
  } else if (filters.minSqm != null) {
    chips.push({ label: "Min size", value: `${filters.minSqm} m²` });
  } else if (filters.maxSqm != null) {
    chips.push({ label: "Max size", value: `${filters.maxSqm} m²` });
  }

  if (filters.minRooms != null && filters.maxRooms != null) {
    chips.push({
      label: "Rooms",
      value: `${filters.minRooms}–${filters.maxRooms}`,
    });
  } else if (filters.minRooms != null) {
    chips.push({ label: "Min rooms", value: String(filters.minRooms) });
  } else if (filters.maxRooms != null) {
    chips.push({ label: "Max rooms", value: String(filters.maxRooms) });
  }

  if (filters.radiusKm != null) {
    chips.push({ label: "Radius", value: `${filters.radiusKm} km` });
  }

  return chips;
}

function slugToLabel(slug: string): string {
  const overrides: Record<string, string> = {
    muenchen: "München",
    "wohnung-mieten": "Wohnung mieten",
  };
  if (overrides[slug]) return overrides[slug];
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatNum(value: number): string {
  return value.toLocaleString("de-DE");
}
