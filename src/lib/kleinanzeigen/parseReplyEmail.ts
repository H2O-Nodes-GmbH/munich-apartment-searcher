/**
 * Parses Kleinanzeigen "Antwort zur Anzeige" notification emails.
 *
 * Body layout (Nov 2026):
 *   Du hast eine Antwort zur Anzeige:
 *   <title>
 *   (Anzeigennummer: 3483743628) erhalten.
 *   Antwort von <name>
 *   <message — may be empty when only photos were sent>
 *   Um auf diese Nachricht zu antworten, …
 *
 * The Anzeigennummer equals listings.external_id (the search card's data-adid).
 */
export type ParsedReplyEmail = {
  adId: string | null;
  adTitle: string | null;
  senderName: string | null;
  message: string | null;
};

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/\n\s*\n+/g, "\n");
}

export function parseReplyEmail(input: {
  subject: string;
  text: string;
}): ParsedReplyEmail {
  const text = input.text.replace(/\r\n/g, "\n");

  const adId =
    text.match(/Anzeigennummer:\s*(\d{6,})/)?.[1] ??
    text.match(/\/s-anzeige\/(?:[^/\s"]+\/)?(\d{6,})/)?.[1] ??
    null;

  const adTitle =
    input.subject.match(/Anzeige\s+["„“](.+?)["“”]\s*$/)?.[1]?.trim() ?? null;

  const replyMatch = text.match(
    /Antwort von[ \t]+([^\n]+)\n([\s\S]*?)Um auf diese Nachricht zu antworten/,
  );
  const senderName = replyMatch?.[1]?.trim() || null;
  const message = replyMatch?.[2]?.trim() || null;

  return { adId, adTitle, senderName, message };
}

export function isKleinanzeigenReply(input: {
  from: string;
  subject: string;
}): boolean {
  return (
    /@mail\.kleinanzeigen\.de/i.test(input.from) &&
    /Antwort zur Anzeige|Nachricht zu|Anfrage zu/i.test(input.subject)
  );
}

/**
 * Gmail sends this to a new forwarding address. Modern Gmail uses a confirm
 * link (`…/mail/vf-…`); older ones also include a numeric code. Cancel links
 * use `uf-` and must not be returned.
 */
export function parseGmailForwardingConfirmation(input: {
  from: string;
  subject: string;
  text: string;
}): { code: string | null; confirmUrl: string | null } | null {
  if (!/forwarding-noreply@google\.com/i.test(input.from)) return null;
  const code =
    input.subject.match(/#(\d{6,})/)?.[1] ??
    input.text.match(/Confirmation code:\s*(\d{6,})/i)?.[1] ??
    null;
  const rawUrl =
    input.text.match(
      /https:\/\/(?:mail-settings\.google\.com|mail\.google\.com)\/mail\/vf-\S+/i,
    )?.[0] ?? null;
  const confirmUrl = rawUrl?.replace(/[),.;>"'\]]+$/, "") ?? null;
  return { code, confirmUrl };
}
