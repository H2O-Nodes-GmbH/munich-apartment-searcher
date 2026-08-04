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

    // Telegram message limit ~4096 chars; send in chunks of ~8 listings.
    const chunkSize = 8;
    for (let i = 0; i < listings.length; i += chunkSize) {
      const chunk = listings.slice(i, i + chunkSize);
      const text = formatTelegramMessage(chunk);
      await this.notifyMessage(text);
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

function formatTelegramMessage(listings: NotifiableListing[]): string {
  const header =
    listings.length === 1
      ? "🏠 New Munich listing"
      : `🏠 ${listings.length} new Munich listings`;

  const body = listings
    .map((l) => {
      const price = l.priceText ?? "—";
      const loc = l.location ?? "—";
      const when = l.postedText ? ` · ${l.postedText}` : "";
      return `<b>${escapeHtml(l.title)}</b>\n${escapeHtml(price)} · ${escapeHtml(loc)}${escapeHtml(when)}\n<a href="${escapeHtml(l.url)}">Open listing</a>`;
    })
    .join("\n\n");

  return `${header}\n\n${body}`;
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
