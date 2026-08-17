const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type FetchPageOptions = {
  userAgent?: string;
  timeoutMs?: number;
};

export type FetchSearchPageOptions = FetchPageOptions;

async function fetchKleinanzeigenPage(
  url: string,
  options: FetchPageOptions = {},
): Promise<{ html: string; finalUrl: string; status: number }> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 25_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": options.userAgent ?? DEFAULT_USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    });

    const html = await response.text();
    return {
      html,
      finalUrl: response.url,
      status: response.status,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches a Kleinanzeigen search results page with a browser-like User-Agent.
 * Prefer search URLs sorted by date so posted timestamps are present:
 *   ...&sortingField=SORTING_DATE
 */
export async function fetchSearchPage(
  url: string,
  options: FetchSearchPageOptions = {},
): Promise<{ html: string; finalUrl: string; status: number }> {
  return fetchKleinanzeigenPage(ensureDateSort(url), options);
}

/** Fetches a single listing detail page (for attributes like Verfügbar ab). */
export async function fetchListingPage(
  url: string,
  options: FetchPageOptions = {},
): Promise<{ html: string; finalUrl: string; status: number }> {
  return fetchKleinanzeigenPage(url, options);
}

/** Append sortingField=SORTING_DATE if not already present. */
export function ensureDateSort(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has("sortingField")) {
      parsed.searchParams.set("sortingField", "SORTING_DATE");
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
