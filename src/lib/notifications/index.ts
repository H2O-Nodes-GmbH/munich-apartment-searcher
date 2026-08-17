/**
 * Notification channel interface — Telegram for v1.
 * Swap or add EmailNotifier later without changing poll callers.
 */
export type NotifiableListing = {
  title: string;
  priceText: string | null;
  location: string | null;
  url: string;
  postedText: string | null;
  /** Move-in date from listing details, e.g. "September 2026" or "01.10.2026" */
  availableFrom: string | null;
  thumbnailUrl: string | null;
};

export interface Notifier {
  notifyNewListings(listings: NotifiableListing[]): Promise<void>;
  notifyMessage(text: string): Promise<void>;
}

export class TelegramNotifier implements Notifier {
  constructor(
    private readonly botToken: string,
    private readonly chatIds: string[],
  ) {}

  async notifyNewListings(listings: NotifiableListing[]): Promise<void> {
    if (listings.length === 0 || this.chatIds.length === 0) return;

    // One message per listing (so each can carry its own photo).
    for (const listing of listings) {
      const caption = formatListingCaption(listing);
      for (const chatId of this.chatIds) {
        await this.sendListing(chatId, listing, caption);
      }
    }
  }

  private async sendListing(
    chatId: string,
    listing: NotifiableListing,
    caption: string,
  ): Promise<void> {
    if (!listing.thumbnailUrl) {
      await sendTelegramMessage(this.botToken, chatId, caption);
      return;
    }

    try {
      await sendTelegramPhoto(
        this.botToken,
        chatId,
        toCompactThumbnail(listing.thumbnailUrl),
        caption,
      );
    } catch {
      // Photo delivery can fail (bad/expired image URL, Telegram fetch issues) —
      // fall back to a text-only message so the alert still goes out.
      await sendTelegramMessage(this.botToken, chatId, caption);
    }
  }

  async notifyMessage(text: string): Promise<void> {
    if (!text.trim() || this.chatIds.length === 0) return;
    for (const chatId of this.chatIds) {
      await sendTelegramMessage(this.botToken, chatId, text);
    }
  }
}

/** Parse TELEGRAM_CHAT_ID — single id or comma-separated (DMs and/or groups). */
export function parseTelegramChatIds(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return [...new Set(raw.split(",").map((id) => id.trim()).filter(Boolean))];
}

export function createNotifierFromEnv(): Notifier | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatIds = parseTelegramChatIds(process.env.TELEGRAM_CHAT_ID);
  if (!botToken || chatIds.length === 0) return null;
  return new TelegramNotifier(botToken, chatIds);
}

export type HoroscopeEntry = {
  name: string;
  signLabel: string;
  emoji: string;
  text: string;
};

export function formatHoroscopeMessage(entries: HoroscopeEntry[]): string {
  const blocks = entries.map(
    (e) =>
      `${e.emoji} <b>${escapeHtml(e.signLabel)} (${escapeHtml(e.name)})</b>\n${escapeHtml(e.text)}`,
  );
  return ["🔮 <b>Daily Horoscope</b>", "", blocks.join("\n\n")].join("\n");
}

export function formatSearchChangeMessage(input: {
  action: "added" | "removed";
  name: string;
  searchUrl: string;
  filtersSummary: string;
}): string {
  const verb = input.action === "added" ? "added" : "removed";
  const emoji = input.action === "added" ? "✅" : "🗑️";
  return [
    `${emoji} <b>Search ${verb}</b>`,
    "",
    `<b>${escapeHtml(input.name)}</b>`,
    escapeHtml(input.filtersSummary),
    `<a href="${escapeHtml(input.searchUrl)}">Open search</a>`,
  ].join("\n");
}

/**
 * Kleinanzeigen's image CDN sizes photos via a `rule` query param (e.g. $_59 ≈ 960px wide).
 * Swap to the compact $_2 preset (~200px) so Telegram renders a small photo, not a full-width one.
 */
function toCompactThumbnail(url: string): string {
  return url.replace(/rule=\$_\d+(\.\w+)?/, (_match, ext: string | undefined) =>
    `rule=$_2${ext || ".JPG"}`,
  );
}

/** Kleinanzeigen location strings look like "81241 Pasing-Obermenzing" — flip to "Pasing-Obermenzing 81241". */
function formatLocation(location: string | null): string {
  if (!location) return "—";
  const match = location.match(/^(\d{5})\s+(.+)$/);
  return match ? `${match[2]} ${match[1]}` : location;
}

/** Telegram photo captions are capped at 1024 chars; plain messages at 4096. */
const CAPTION_MAX_LENGTH = 1024;

function formatListingCaption(
  listing: NotifiableListing,
  maxLength = CAPTION_MAX_LENGTH,
): string {
  const price = listing.priceText ?? "—";
  const loc = formatLocation(listing.location);
  const availableLabel = listing.availableFrom
    ? escapeHtml(listing.availableFrom)
    : "nicht angegeben";

  const build = (title: string) =>
    [
      `📅 <b>Verfügbar ab: ${availableLabel}</b>`,
      "",
      `<b>${escapeHtml(title)}</b>`,
      `${escapeHtml(price)} · ${escapeHtml(loc)}`,
      "",
      `<a href="${escapeHtml(listing.url)}">Open listing</a>`,
    ].join("\n");

  let title = listing.title;
  // Trim the raw title (not the assembled HTML) so we never cut a tag in half.
  while (build(title).length > maxLength && title.length > 1) {
    title = title.slice(0, -1);
  }
  if (title !== listing.title) title = `${title.trimEnd()}…`;

  return build(title);
}

async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  text: string,
): Promise<void> {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    },
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Telegram API ${response.status}: ${errBody}`);
  }
}

/** Telegram fetches the photo itself when given a plain HTTP(S) URL. */
async function sendTelegramPhoto(
  botToken: string,
  chatId: string,
  photoUrl: string,
  caption: string,
): Promise<void> {
  const response = await fetch(
    `https://api.telegram.org/bot${botToken}/sendPhoto`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption,
        parse_mode: "HTML",
      }),
    },
  );

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Telegram API ${response.status}: ${errBody}`);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
