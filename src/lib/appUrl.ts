/** Stable app base URL for Telegram links (prefer production over ephemeral cron host). */
export function appBaseUrl(request?: Request): string {
  const configured =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null);
  if (configured) {
    return configured.replace(/\/$/, "");
  }
  if (request) {
    return new URL(request.url).origin;
  }
  return "https://munich-apartment-searcher.vercel.app";
}

export function appPipelineUrl(request?: Request): string {
  return `${appBaseUrl(request)}/pipeline`;
}
