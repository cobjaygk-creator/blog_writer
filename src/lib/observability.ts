import * as Sentry from "@sentry/nextjs";

export type JobLogContext = {
  jobId?: string;
  postId?: string;
  userId?: string;
  kind?: string;
  phase?: string;
  status?: string;
  [key: string]: unknown;
};

function sentryEnabled() {
  return Boolean(
    process.env.SENTRY_DSN?.trim() || process.env.NEXT_PUBLIC_SENTRY_DSN?.trim(),
  );
}

function serializeExtra(extra?: JobLogContext) {
  if (!extra) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = v;
    } else {
      try {
        out[k] = JSON.stringify(v).slice(0, 500);
      } catch {
        out[k] = String(v);
      }
    }
  }
  return out;
}

/** Structured console + optional Sentry breadcrumb. */
export function logInfo(scope: string, message: string, extra?: JobLogContext) {
  const payload = { scope, message, ...extra, ts: new Date().toISOString() };
  console.info(`[${scope}]`, message, extra || "");
  if (sentryEnabled()) {
    Sentry.addBreadcrumb({
      category: scope,
      message,
      level: "info",
      data: serializeExtra(extra),
    });
  }
  return payload;
}

export function logWarn(scope: string, message: string, extra?: JobLogContext) {
  console.warn(`[${scope}]`, message, extra || "");
  if (sentryEnabled()) {
    Sentry.addBreadcrumb({
      category: scope,
      message,
      level: "warning",
      data: serializeExtra(extra),
    });
    Sentry.captureMessage(`[${scope}] ${message}`, {
      level: "warning",
      extra: serializeExtra(extra),
      tags: {
        scope,
        kind: String(extra?.kind || ""),
        phase: String(extra?.phase || ""),
      },
    });
  }
}

export function logError(
  scope: string,
  message: string,
  error?: unknown,
  extra?: JobLogContext,
) {
  console.error(`[${scope}]`, message, error, extra || "");
  if (!sentryEnabled()) return;

  const err =
    error instanceof Error
      ? error
      : new Error(typeof error === "string" ? error : message);

  Sentry.withScope((sentryScope) => {
    sentryScope.setTag("scope", scope);
    if (extra?.kind) sentryScope.setTag("kind", String(extra.kind));
    if (extra?.phase) sentryScope.setTag("phase", String(extra.phase));
    if (extra?.jobId) sentryScope.setTag("jobId", String(extra.jobId));
    if (extra?.postId) sentryScope.setTag("postId", String(extra.postId));
    const data = serializeExtra(extra);
    if (data) sentryScope.setExtras(data);
    sentryScope.setExtra("logMessage", message);
    Sentry.captureException(err);
  });
}

/** Generation-job helpers — keep call sites short and consistent. */
export const jobLog = {
  phase(ctx: JobLogContext & { phase: string }) {
    logInfo("post-generate-job", `phase=${ctx.phase}`, ctx);
  },
  warn(message: string, ctx?: JobLogContext) {
    logWarn("post-generate-job", message, ctx);
  },
  fail(message: string, error: unknown, ctx?: JobLogContext) {
    logError("post-generate-job", message, error, ctx);
  },
};
