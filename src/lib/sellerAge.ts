/**
 * Kleinanzeigen only exposes seller age as a calendar date ("Aktiv seit 05.02.2012"),
 * not a timestamp. An account is treated as too new if that date is today or
 * yesterday in Europe/Berlin — the closest match to "same day or under 48 hours"
 * given date-only data.
 */

export const NEW_SELLER_EXCLUDE_TERM = "new-account";

const BERLIN = "Europe/Berlin";

export function isSellerAccountTooNew(
  activeSinceYmd: string | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!activeSinceYmd || !/^\d{4}-\d{2}-\d{2}$/.test(activeSinceYmd)) {
    return false;
  }
  const today = berlinYmd(now);
  const daysAgo = utcCalendarDaysBetween(activeSinceYmd, today);
  return daysAgo === 0 || daysAgo === 1;
}

export function berlinYmd(now: Date): string {
  // en-CA yields YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BERLIN,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function utcCalendarDaysBetween(fromYmd: string, toYmd: string): number {
  const from = utcDay(fromYmd);
  const to = utcDay(toYmd);
  if (from == null || to == null) return Number.POSITIVE_INFINITY;
  return Math.round((to - from) / 86_400_000);
}

function utcDay(ymd: string): number | null {
  const match = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}
