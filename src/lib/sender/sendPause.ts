function parseBerlinDate(raw: string | undefined): Date | null {
  const value = raw?.trim();
  if (!value) return null;
  // Date-only → treat as Europe/Berlin start of day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00+01:00`);
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * When set, auto-send is paused until this instant (ISO date or datetime).
 * Example: SEND_PAUSE_UNTIL=2026-11-30 → messaging resumes Nov 30 Europe/Berlin midnight.
 */
export function getSendPauseUntil(): Date | null {
  return parseBerlinDate(process.env.SEND_PAUSE_UNTIL);
}

/**
 * Temporary override: sending runs until this instant even inside a pause,
 * then the pause takes over again on its own.
 * Example: SEND_RESUME_UNTIL=2026-11-21T16:30:00+01:00
 */
export function getSendResumeUntil(): Date | null {
  return parseBerlinDate(process.env.SEND_RESUME_UNTIL);
}

export function isSendPaused(now = new Date()): {
  paused: boolean;
  until: Date | null;
} {
  const until = getSendPauseUntil();
  if (!until) return { paused: false, until: null };
  const resumeUntil = getSendResumeUntil();
  if (resumeUntil && now < resumeUntil) return { paused: false, until };
  return { paused: now < until, until };
}
