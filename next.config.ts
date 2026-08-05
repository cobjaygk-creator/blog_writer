import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  transpilePackages: ["@toast-ui/editor"],
};

export default withSentryConfig(nextConfig, {
  // Source map upload only when auth token is set (optional in local/dev)
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  // Skip upload when credentials missing so `next build` still works
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
});
