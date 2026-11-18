import type { Page } from "playwright-core";
import { closeSenderSession, openSenderSession } from "@/lib/sender/browser";

export type SendResult =
  | { ok: true; sessionId: string }
  | {
      ok: false;
      sessionId: string | null;
      reason: "login_required" | "captcha" | "form_changed" | "send_failed" | "error";
      detail: string;
    };

const LOGIN_URL_RE = /m-einloggen\.html/i;
const CAPTCHA_RE = /captcha|ich bin kein roboter|recaptcha|hcaptcha/i;

async function pageLooksLoggedOut(page: Page): Promise<boolean> {
  if (LOGIN_URL_RE.test(page.url())) return true;
  const loginCta = page.locator(
    "#viewad-contact-button-login, #viewad-contact-button-login-modal, a.j-overlay-login",
  );
  if ((await loginCta.count()) > 0 && (await loginCta.first().isVisible().catch(() => false))) {
    return true;
  }
  return false;
}

async function pageLooksCaptcha(page: Page): Promise<boolean> {
  const body = ((await page.locator("body").innerText().catch(() => "")) || "").slice(0, 4000);
  if (CAPTCHA_RE.test(body)) return true;
  if ((await page.locator("iframe[src*='recaptcha'], iframe[src*='hcaptcha']").count()) > 0) {
    return true;
  }
  return false;
}

async function openContactForm(page: Page): Promise<void> {
  const textarea = page.locator("#viewad-contact-message");
  if (await textarea.isVisible().catch(() => false)) return;

  const openers = [
    "#viewad-contact-button-login-modal",
    "#viewad-contact-button-login",
    "button:has-text('Nachricht schreiben')",
    "a:has-text('Nachricht schreiben')",
  ];
  for (const sel of openers) {
    const btn = page.locator(sel).first();
    if ((await btn.count()) === 0) continue;
    if (!(await btn.isVisible().catch(() => false))) continue;
    await btn.click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    if (await textarea.isVisible().catch(() => false)) return;
  }
}

/**
 * Send one landlord message via Browserbase + Max's persisted Kleinanzeigen session.
 * No Telegram on success — callers only alert on hard failures if they choose to.
 */
export async function sendListingMessage(input: {
  listingUrl: string;
  message: string;
}): Promise<SendResult> {
  let sessionId: string | null = null;
  let session: Awaited<ReturnType<typeof openSenderSession>> | null = null;

  try {
    session = await openSenderSession({ persist: true });
    sessionId = session.sessionId;
    const { page } = session;

    await page.goto(input.listingUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(1_500);

    if (await pageLooksCaptcha(page)) {
      return {
        ok: false,
        sessionId,
        reason: "captcha",
        detail: "Captcha detected on listing page",
      };
    }

    if (await pageLooksLoggedOut(page)) {
      return {
        ok: false,
        sessionId,
        reason: "login_required",
        detail: "Kleinanzeigen session expired — re-run /api/sender/login-session",
      };
    }

    await openContactForm(page);

    const textarea = page.locator("#viewad-contact-message");
    if (!(await textarea.isVisible().catch(() => false))) {
      return {
        ok: false,
        sessionId,
        reason: "form_changed",
        detail: "Contact message field not found",
      };
    }

    await textarea.fill(input.message);

    const submit = page.locator("button.viewad-contact-submit, button:has-text('Nachricht senden')").first();
    if (!(await submit.isVisible().catch(() => false))) {
      return {
        ok: false,
        sessionId,
        reason: "form_changed",
        detail: "Send button not found",
      };
    }

    await submit.click();
    await page.waitForTimeout(2_000);

    if (await pageLooksCaptcha(page)) {
      return {
        ok: false,
        sessionId,
        reason: "captcha",
        detail: "Captcha appeared after submit",
      };
    }

    const success = page.locator(".j-viewad-contact-success, #contact-message-success-msg");
    const errorBox = page.locator(".j-viewad-contact-error");

    if (await success.first().isVisible().catch(() => false)) {
      return { ok: true, sessionId };
    }

    // Some flows hide the modal and show a toast; treat missing error + cleared form as ok.
    const errorVisible = await errorBox.first().isVisible().catch(() => false);
    if (errorVisible) {
      const detail = ((await errorBox.first().innerText().catch(() => "")) || "Send failed").trim();
      return { ok: false, sessionId, reason: "send_failed", detail: detail.slice(0, 500) };
    }

    // Fallback: AJAX success often toggles the success block with a short delay.
    await page.waitForTimeout(2_000);
    if (await success.first().isVisible().catch(() => false)) {
      return { ok: true, sessionId };
    }

    return {
      ok: false,
      sessionId,
      reason: "send_failed",
      detail: "No success confirmation after submit",
    };
  } catch (error) {
    return {
      ok: false,
      sessionId,
      reason: "error",
      detail: error instanceof Error ? error.message : "Unknown sender error",
    };
  } finally {
    if (session) await closeSenderSession(session);
  }
}
