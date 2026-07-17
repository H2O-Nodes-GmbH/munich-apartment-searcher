import { timingSafeEqual } from "crypto";

export function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET || process.env.APP_PASSWORD;
  if (!secret) {
    // Local/dev convenience: allow when no secrets configured.
    return process.env.NODE_ENV !== "production";
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return safeEqual(authHeader.slice(7), secret);
  }

  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  if (querySecret) {
    return safeEqual(querySecret, secret);
  }

  return false;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
