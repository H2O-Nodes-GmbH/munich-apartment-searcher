/**
 * When set, auto-send is paused until this instant (ISO date or datetime).
 * Example: SEND_PAUSE_UNTIL=2026-11-30 → messaging resumes Nov 30 Europe/Berlin midnight.
 */
export function getSendPauseUntil(): Date | null {
  const raw = process.env.SEND_PAUSE_UNTIL?.trim();
  if (!raw) return null;
  // Date-only → treat as Europe/Berlin start of day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return new Date(`${raw}T00:00:00+01:00`);
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isSendPaused(now = new Date()): {
  paused: boolean;
  until: Date | null;
} {
  const until = getSendPauseUntil();
  if (!until) return { paused: false, until: null };
  return { paused: now < until, until };
}
