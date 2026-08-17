/**
 * Free daily horoscope lookup — freehoroscopeapi.com, no API key required.
 * Used for the "Daily Horoscope" Telegram cron (src/app/api/cron/horoscope).
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

const API_BASE = "https://freehoroscopeapi.com/api/v1/get-horoscope/daily";

/** Best-effort fetch — returns null on any failure so callers can skip gracefully. */
export async function fetchDailyHoroscope(
  sign: HoroscopeSign,
  options: { timeoutMs?: number } = {},
): Promise<string | null> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 10_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${API_BASE}?sign=${sign}&day=today`, {
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
