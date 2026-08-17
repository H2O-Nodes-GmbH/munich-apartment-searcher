import { NextResponse } from "next/server";
import { isAuthorized } from "@/lib/auth";
import { fetchDailyHoroscope, type HoroscopeSign } from "@/lib/horoscope";
import {
  createNotifierFromEnv,
  formatHoroscopeMessage,
  type HoroscopeEntry,
} from "@/lib/notifications";

export const runtime = "nodejs";
export const maxDuration = 30;

const TARGET_HOUR_BERLIN = 21; // 9pm

/** Order: Milena first, Max second. */
const PEOPLE: { name: string; sign: HoroscopeSign; signLabel: string; emoji: string }[] = [
  { name: "Milena", sign: "taurus", signLabel: "Taurus", emoji: "♉" },
  { name: "Max", sign: "sagittarius", signLabel: "Sagittarius", emoji: "♐" },
];

/**
 * Vercel Cron only runs in UTC with no DST awareness, so this route is scheduled
 * at both 19:00 and 20:00 UTC (see vercel.json). Whichever run lands on 21:00
 * Europe/Berlin actually sends; the other is a no-op. Self-corrects across DST.
 */
function isNinePmBerlin(now: Date): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  return hour === TARGET_HOUR_BERLIN;
}

/**
 * Vercel Cron + manual trigger.
 * Auth: Authorization: Bearer <CRON_SECRET>
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "1";
  const now = new Date();

  if (!force && !isNinePmBerlin(now)) {
    return NextResponse.json({ ok: true, skipped: true, reason: "Not 9pm Europe/Berlin" });
  }

  try {
    const entries: HoroscopeEntry[] = [];
    for (const person of PEOPLE) {
      const text = await fetchDailyHoroscope(person.sign);
      if (text) {
        entries.push({
          name: person.name,
          signLabel: person.signLabel,
          emoji: person.emoji,
          text,
        });
      }
    }

    if (entries.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Horoscope API returned no data" },
        { status: 502 },
      );
    }

    const notifier = createNotifierFromEnv();
    if (notifier) {
      await notifier.notifyMessage(formatHoroscopeMessage(entries));
    }

    return NextResponse.json({
      ok: true,
      sentAt: now.toISOString(),
      people: entries.map((e) => e.name),
      notified: Boolean(notifier),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
