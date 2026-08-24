/**
 * Daily horoscope lookup for the "Daily Horoscope" Telegram cron
 * (src/app/api/cron/horoscope).
 *
 * Primary source: ohmanda.com — unofficial free API mirroring Astrology.com's
 * daily horoscopes. Better-written than generic template APIs, but it's a
 * single-maintainer scraper on old infra, so we fall back to
 * freehoroscopeapi.com (a more generic but more stable free API) if it fails.
 */

export type HoroscopeSign =
  | "aries"
  | "taurus"
  | "gemini"
  | "cancer"
  | "leo"
  | "virgo"
  | "libra"
  | "scorpio"
  | "sagittarius"
  | "capricorn"
  | "aquarius"
  | "pisces";

const OHMANDA_BASE = "https://ohmanda.com/api/horoscope";
const FALLBACK_BASE = "https://freehoroscopeapi.com/api/v1/get-horoscope/daily";

/** Best-effort fetch — tries ohmanda first, falls back, returns null if both fail. */
export async function fetchDailyHoroscope(
  sign: HoroscopeSign,
  options: { timeoutMs?: number } = {},
): Promise<string | null> {
  const timeoutMs = options.timeoutMs ?? 10_000;

  const primary = await fetchOhmanda(sign, timeoutMs);
  if (primary) return primary;

  return fetchFallback(sign, timeoutMs);
}

async function fetchOhmanda(
  sign: HoroscopeSign,
  timeoutMs: number,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${OHMANDA_BASE}/${sign}/`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const json = (await response.json()) as { horoscope?: string };
    return json.horoscope?.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchFallback(
  sign: HoroscopeSign,
  timeoutMs: number,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${FALLBACK_BASE}?sign=${sign}&day=today`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const json = (await response.json()) as {
      data?: { horoscope?: string };
    };
    return json.data?.horoscope?.trim() || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
