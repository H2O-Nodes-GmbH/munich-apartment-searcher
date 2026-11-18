import type { ListingStatus } from "@/lib/types";

export type StageDef = {
  value: ListingStatus;
  label: string;
};

/** Ordered CRM funnel. `new` is the inbox; `lost` sits outside the board. */
export const STAGES: StageDef[] = [
  { value: "new", label: "Inbox" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "messaged", label: "Messaged" },
  { value: "replied", label: "Replied" },
  { value: "viewing", label: "Viewing booked" },
  { value: "viewed", label: "Viewed" },
  { value: "applied", label: "Applied" },
  { value: "won", label: "Got it" },
  { value: "lost", label: "Lost" },
];

export const STATUS_VALUES = STAGES.map((s) => s.value);

export const BOARD_STAGES = STAGES.filter(
  (s) => s.value !== "new" && s.value !== "lost",
);

export function isListingStatus(value: unknown): value is ListingStatus {
  return (
    typeof value === "string" &&
    (STATUS_VALUES as string[]).includes(value)
  );
}

export function stageLabel(status: ListingStatus): string {
  return STAGES.find((s) => s.value === status)?.label ?? status;
}

/** Next stage along the board, or null at the end of the funnel. */
export function nextStage(status: ListingStatus): ListingStatus | null {
  const order = BOARD_STAGES.map((s) => s.value);
  if (status === "new") return "shortlisted";
  const i = order.indexOf(status);
  return i >= 0 && i < order.length - 1 ? order[i + 1] : null;
}

export function previousStage(status: ListingStatus): ListingStatus | null {
  const order = BOARD_STAGES.map((s) => s.value);
  const i = order.indexOf(status);
  if (i === 0) return "new";
  return i > 0 ? order[i - 1] : null;
}

export const APP_TIME_ZONE = "Europe/Berlin";

const berlinPartsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function berlinParts(date: Date): Record<string, string> {
  return Object.fromEntries(
    berlinPartsFormat.formatToParts(date).map((p) => [p.type, p.value]),
  );
}

/** ISO instant → `YYYY-MM-DDTHH:mm` wall time in Munich, for datetime-local inputs. */
export function toBerlinInputValue(iso: string | null): string {
  if (!iso) return "";
  const p = berlinParts(new Date(iso));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** `YYYY-MM-DDTHH:mm` Munich wall time → Date, independent of server timezone. */
export function fromBerlinInputValue(value: string): Date | null {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const p = berlinParts(new Date(asUtc));
  const wallAsUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
  );
  return new Date(asUtc - (wallAsUtc - asUtc));
}

export const DEFAULT_MESSAGE_TEMPLATE = `Hallo,

wir haben Ihre Anzeige „{{title}}“ ({{price}}, {{location}}) gesehen und sind sehr interessiert.

Wir sind Max und Milena, ein berufstätiges Paar, und suchen ab Dezember/Januar eine Wohnung in München. Wir sind Nichtraucher, haben keine Haustiere und können alle Unterlagen (Gehaltsnachweise, SCHUFA, Mietschuldenfreiheit) sofort bereitstellen.

Wir sind in den nächsten Wochen in München und würden die Wohnung sehr gerne besichtigen. Wann würde es Ihnen passen?

Viele Grüße
Max & Milena`;

export function renderMessage(
  template: string,
  listing: {
    title: string;
    price_text: string | null;
    location: string | null;
    url: string;
  },
): string {
  const values: Record<string, string> = {
    title: listing.title,
    price: listing.price_text ?? "Preis auf Anfrage",
    location: listing.location ?? "München",
    url: listing.url,
  };
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    key in values ? values[key] : match,
  );
}
