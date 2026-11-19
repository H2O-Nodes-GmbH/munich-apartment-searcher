import type { Page } from "playwright-core";
import { closeSenderSession, openSenderSession } from "@/lib/sender/browser";

export type SendResult =
  | { ok: true; sessionId: string }
  | {
      ok: false;
      sessionId: string | null;
      reason:
        | "login_required"
        | "captcha"
        | "form_changed"
        | "listing_unavailable"
        | "send_failed"
        | "error";
      detail: string;
    };

const LOGIN_URL_RE = /m-einloggen\.html|login\.kleinanzeigen\.de/i;
const CAPTCHA_RE = /captcha|ich bin kein roboter|recaptcha|hcaptcha/i;
const LISTING_URL_RE = /\/s-anzeige\//i;

async function dismissCookieBanner(page: Page): Promise<void> {
  for (const sel of [
    "button:has-text('Alle akzeptieren')",
    "button:has-text('Akzeptieren und weiter')",
    "button:has-text('Akzeptieren')",
    "#gdpr-banner-accept",
    "[data-testid='gdpr-banner-accept']",
  ]) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click({ timeout: 3_000 }).catch(() => undefined);
      await page.waitForTimeout(500);
    }
  }
}

async function pageLooksLoggedOut(page: Page): Promise<boolean> {
  if (LOGIN_URL_RE.test(page.url())) return true;
  // Logged-in header usually shows the email / Ausloggen.
  const loggedIn = await page
    .locator("text=/angemeldet als|Ausloggen|Abmelden/i")
    .first()
    .isVisible()
    .catch(() => false);
  if (loggedIn) return false;

  const loginOverlay = page.locator(
    "a.j-overlay-login, .login-overlay:not(.is-hidden) a.j-overlay-login",
  );
  if (await loginOverlay.first().isVisible().catch(() => false)) return true;
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

async function openContactForm(page: Page): Promise<boolean> {
  const textarea = page.locator("#viewad-contact-message, textarea[name='message']").first();
  if (await textarea.isVisible().catch(() => false)) return true;

  const openers = [
    "button:has-text('Nachricht schreiben')",
    "a:has-text('Nachricht schreiben')",
    "#viewad-contact-button-login-modal",
    "#viewad-contact-button-login",
    "button.viewad-contact-submit",
  ];

  for (const sel of openers) {
    const btn = page.locator(sel).first();
    if (!(await btn.isVisible().catch(() => false))) continue;
    await btn.click({ timeout: 5_000 }).catch(() => undefined);
    try {
      await textarea.waitFor({ state: "visible", timeout: 8_000 });
      return true;
    } catch {
      // try next opener
    }
  }

  // Last resort: unhide the modal form if it's present but CSS-hidden.
  const forced = await page.evaluate(() => {
    const form = document.querySelector<HTMLElement>("#viewad-contact-modal-form");
    const field = document.querySelector<HTMLElement>("#viewad-contact-message");
    if (!form || !field) return false;
    form.classList.remove("mfp-hide", "is-hidden");
    form.style.display = "block";
    field.style.display = "block";
    return true;
  });
  if (forced) {
    try {
      await textarea.waitFor({ state: "visible", timeout: 3_000 });
      return true;
    } catch {
      return false;
    }
  }
  return false;
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
    await dismissCookieBanner(page);

    if (!LISTING_URL_RE.test(page.url())) {
      return {
        ok: false,
        sessionId,
        reason: "listing_unavailable",
        detail: `Listing page redirected away (${page.url()})`,
      };
    }

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

    const opened = await openContactForm(page);
    const textarea = page.locator("#viewad-contact-message, textarea[name='message']").first();
    if (!opened || !(await textarea.isVisible().catch(() => false))) {
      return {
        ok: false,
        sessionId,
        reason: "form_changed",
        detail: "Contact message field not found",
      };
    }

    await textarea.fill(input.message);

    const submit = page
      .locator("button.viewad-contact-submit, button:has-text('Nachricht senden')")
      .first();
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

    const errorVisible = await errorBox.first().isVisible().catch(() => false);
    if (errorVisible) {
      const detail = ((await errorBox.first().innerText().catch(() => "")) || "Send failed").trim();
      return { ok: false, sessionId, reason: "send_failed", detail: detail.slice(0, 500) };
    }

    await page.waitForTimeout(2_000);
    if (await success.first().isVisible().catch(() => false)) {
      return { ok: true, sessionId };
    }

    // Some logged-in flows close the modal without a success banner; if the
    // textarea emptied / disappeared, treat as sent.
    const stillVisible = await textarea.isVisible().catch(() => false);
    const value = stillVisible ? await textarea.inputValue().catch(() => input.message) : "";
    if (!stillVisible || value.trim() === "") {
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
