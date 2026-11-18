import Browserbase from "@browserbasehq/sdk";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";

export type SenderSession = {
  sessionId: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  debuggerUrl: string | null;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function createBrowserbaseClient(): Browserbase {
  return new Browserbase({ apiKey: requireEnv("BROWSERBASE_API_KEY") });
}

/**
 * Open a Browserbase session bound to the persistent Kleinanzeigen context.
 * `persist: true` writes cookies/login back when the session closes.
 */
export async function openSenderSession(options?: {
  persist?: boolean;
  keepAlive?: boolean;
}): Promise<SenderSession> {
  const bb = createBrowserbaseClient();
  const projectId = process.env.BROWSERBASE_PROJECT_ID?.trim();
  const contextId = requireEnv("BROWSERBASE_CONTEXT_ID");

  const session = await bb.sessions.create({
    ...(projectId ? { projectId } : {}),
    keepAlive: options?.keepAlive ?? false,
    browserSettings: {
      context: {
        id: contextId,
        persist: options?.persist ?? true,
      },
      solveCaptchas: true,
    },
  });

  const browser = await chromium.connectOverCDP(session.connectUrl);
  const context = browser.contexts()[0] ?? (await browser.newContext());
  const page = context.pages()[0] ?? (await context.newPage());

  let debuggerUrl: string | null = null;
  try {
    const debug = await bb.sessions.debug(session.id);
    debuggerUrl = debug.debuggerFullscreenUrl ?? debug.debuggerUrl ?? null;
  } catch {
    debuggerUrl = null;
  }

  return { sessionId: session.id, browser, context, page, debuggerUrl };
}

export async function closeSenderSession(session: SenderSession): Promise<void> {
  try {
    await session.browser.close();
  } catch {
    // Session may already be gone.
  }
}
