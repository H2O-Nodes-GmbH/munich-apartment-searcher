import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // playwright-core must stay external + traced: browsers.json is loaded via a
  // dynamic require that Next/Vercel file tracing otherwise drops (Playwright ≥1.60).
  serverExternalPackages: ["playwright-core", "@browserbasehq/sdk"],
  outputFileTracingIncludes: {
    "/api/cron/send": ["./node_modules/playwright-core/**"],
    "/api/sender/login-session": ["./node_modules/playwright-core/**"],
    "/api/sender/login-session/complete": ["./node_modules/playwright-core/**"],
  },
};

export default nextConfig;
