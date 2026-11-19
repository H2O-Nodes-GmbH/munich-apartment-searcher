import type { Locator, Page } from "playwright-core";
import { closeSenderSession, openSenderSession } from "@/lib/sender/browser";
import { loadContactProfile } from "@/lib/sender/contactProfile";

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
  const loggedIn = await page
    .locator("text=/angemeldet als|Ausloggen|Abmelden/i")
    .first()
    .isVisible()
    .catch(() => false);
  if (loggedIn) return false;
  const loginOverlay = page.locator(
    "a.j-overlay-login, .login-overlay:not(.is-hidden) a.j-overlay-login",
  );
  return loginOverlay.first().isVisible().catch(() => false);
}

async function pageLooksCaptcha(page: Page): Promise<boolean> {
  const body = ((await page.locator("body").innerText().catch(() => "")) || "").slice(0, 4000);
  if (CAPTCHA_RE.test(body)) return true;
  return (await page.locator("iframe[src*='recaptcha'], iframe[src*='hcaptcha']").count()) > 0;
}

async function openContactUi(page: Page): Promise<"legacy" | "extended" | null> {
  // Already open?
  if (await page.locator("dialog[open] textarea").first().isVisible().catch(() => false)) {
    return "extended";
  }
  if (await page.locator("#viewad-contact-message").first().isVisible().catch(() => false)) {
    return "legacy";
  }

  const openers = [
    "#viewad-contact-button",
    "button:has-text('Nachricht schreiben')",
    "a:has-text('Nachricht schreiben')",
    "#viewad-contact-button-login-modal",
    "#viewad-contact-button-login",
  ];
  for (const sel of openers) {
    const btn = page.locator(sel).first();
    if (!(await btn.isVisible().catch(() => false))) continue;
    await btn.click({ timeout: 5_000 }).catch(() => undefined);
    await page.waitForTimeout(1_000);

    if (await page.locator("dialog[open]").count()) {
      try {
        await page.locator("dialog[open] textarea").first().waitFor({
          state: "visible",
          timeout: 8_000,
        });
        return "extended";
      } catch {
        // keep trying
      }
    }

    if (await page.locator("#viewad-contact-message").first().isVisible().catch(() => false)) {
      return "legacy";
    }
  }

  return null;
}

async function selectComboboxByIndex(
  page: Page,
  root: Locator,
  index: number,
  optionText: string,
): Promise<void> {
  const combo = root.locator("button[role='combobox']").nth(index);
  await combo.scrollIntoViewIfNeeded().catch(() => undefined);
  await combo.click({ timeout: 8_000, force: true });
  await page.waitForTimeout(400);
  const option = page.locator(`[role='option']`).filter({ hasText: optionText }).first();
  await option.click({ timeout: 8_000, force: true });
  await page.waitForTimeout(350);
}

async function fillByLabel(
  root: Locator,
  labelText: string,
  value: string,
): Promise<void> {
  const field = root.getByLabel(labelText, { exact: false }).first();
  if (await field.count()) {
    await field.fill(value);
    return;
  }
  const inputId = await root
    .locator(`label:has-text('${labelText}')`)
    .first()
    .getAttribute("for")
    .catch(() => null);
  if (inputId) {
    await root.locator(`#${CSS.escape(inputId)}`).fill(value);
  }
}

async function fillExtendedForm(page: Page, message: string): Promise<void> {
  const profile = loadContactProfile();
  const dialog = page.locator("dialog[open]");
  const root = (await dialog.count())
    ? dialog
    : page.locator("#viewad-contact-form-container");

  const textarea = root.locator("textarea").first();
  await textarea.waitFor({ state: "visible", timeout: 8_000 });
  await textarea.fill(message);

  // Combobox order in the extended rental form:
  // 0 Anrede, 1 Schufa, 2 Arbeitsverhältnis, 3 Nettoeinkommen, 4 Haushaltstyp
  await selectComboboxByIndex(page, root, 0, profile.salutation);
  await fillByLabel(root, "Vorname", profile.firstName);
  await fillByLabel(root, "Nachname", profile.lastName);

  if (process.env.KA_CONTACT_STREET?.trim()) {
    await fillByLabel(root, "Straße", process.env.KA_CONTACT_STREET.trim());
  }
  if (process.env.KA_CONTACT_ZIP?.trim()) {
    await fillByLabel(root, "PLZ", process.env.KA_CONTACT_ZIP.trim());
  }
  if (process.env.KA_CONTACT_CITY?.trim()) {
    await fillByLabel(root, "Ort", process.env.KA_CONTACT_CITY.trim());
  }
  if (process.env.KA_CONTACT_PHONE?.trim()) {
    await fillByLabel(root, "Telefon", process.env.KA_CONTACT_PHONE.trim());
  }

  await selectComboboxByIndex(page, root, 1, profile.schufa);
  await selectComboboxByIndex(page, root, 2, profile.employment);
  await selectComboboxByIndex(page, root, 3, profile.income);
  await selectComboboxByIndex(page, root, 4, profile.household);

  if (profile.pets) {
    await fillByLabel(root, "Tiere", profile.pets).catch(() => undefined);
  }
}

async function fillLegacyForm(page: Page, message: string): Promise<void> {
  const textarea = page.locator("#viewad-contact-message, textarea[name='message']").first();
  await textarea.waitFor({ state: "visible", timeout: 8_000 });
  await textarea.fill(message);
}

async function clickSend(page: Page): Promise<boolean> {
  const submit = page
    .locator("dialog[open]")
    .locator("button:has-text('Nachricht senden')")
    .first();
  const legacy = page.locator("button.viewad-contact-submit").first();
  const btn = (await submit.isVisible().catch(() => false)) ? submit : legacy;
  if (!(await btn.isVisible().catch(() => false))) return false;
  await btn.scrollIntoViewIfNeeded().catch(() => undefined);
  await btn.click({ timeout: 10_000, force: true });
  return true;
}

/**
 * Send one landlord message via Browserbase + Max's persisted Kleinanzeigen session.
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

    await page.goto(input.listingUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
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

    const formKind = await openContactUi(page);
    if (!formKind) {
      return {
        ok: false,
        sessionId,
        reason: "form_changed",
        detail: "Could not open contact form",
      };
    }

    if (formKind === "extended") {
      await fillExtendedForm(page, input.message);
    } else {
      await fillLegacyForm(page, input.message);
    }

    if (!(await clickSend(page))) {
      return {
        ok: false,
        sessionId,
        reason: "form_changed",
        detail: "Send button not found",
      };
    }

    await page.waitForTimeout(2_500);

    if (await pageLooksCaptcha(page)) {
      return {
        ok: false,
        sessionId,
        reason: "captcha",
        detail: "Captcha appeared after submit",
      };
    }

    const success = page.locator(
      ".j-viewad-contact-success, #contact-message-success-msg, text=/Nachricht.*gesendet|erfolgreich gesendet|wurde gesendet/i",
    );
    const errorBox = page.locator(
      ".j-viewad-contact-error, [role='alert'], text=/Fehler|nicht gesendet|ungültig/i",
    );

    if (await success.first().isVisible().catch(() => false)) {
      return { ok: true, sessionId };
    }

    // Dialog closed after send is a good signal for the new UI.
    const dialogStillOpen = (await page.locator("dialog[open]").count()) > 0;
    if (formKind === "extended" && !dialogStillOpen) {
      return { ok: true, sessionId };
    }

    if (await errorBox.first().isVisible().catch(() => false)) {
      const detail = (
        (await errorBox.first().innerText().catch(() => "")) || "Send failed"
      ).trim();
      return {
        ok: false,
        sessionId,
        reason: "send_failed",
        detail: detail.slice(0, 500),
      };
    }

    await page.waitForTimeout(2_000);
    if (await success.first().isVisible().catch(() => false)) {
      return { ok: true, sessionId };
    }
    if (formKind === "extended" && (await page.locator("dialog[open]").count()) === 0) {
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
