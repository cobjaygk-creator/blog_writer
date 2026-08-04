import { createHmac, timingSafeEqual } from "crypto";

import { auth } from "@/lib/auth";

/** Shared cookie domain for .ditodio.com (omit locally). */
export function authCookieDomain() {
  const d = process.env.AUTH_COOKIE_DOMAIN?.trim();
  return d || undefined;
}

export function platformServiceToken() {
  return process.env.PLATFORM_SERVICE_TOKEN?.trim() || "";
}

export function handoffSecret() {
  return (
    process.env.PLATFORM_HANDOFF_SECRET?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    ""
  );
}

export function verifyPlatformServiceRequest(request: Request): boolean {
  const expected = platformServiceToken();
  if (!expected) return false;
  const header =
    request.headers.get("x-platform-token") ||
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  if (!header || header.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
  } catch {
    return false;
  }
}

type HandoffPayload = {
  sub: string;
  email: string;
  plan: string;
  role?: string;
  exp: number;
};

export function signHandoffToken(input: {
  sub: string;
  email: string;
  plan: string;
  role?: string;
  ttlSec?: number;
}): string {
  const secret = handoffSecret();
  if (!secret) throw new Error("PLATFORM_HANDOFF_SECRET / AUTH_SECRET required");
  const payload: HandoffPayload = {
    sub: input.sub,
    email: input.email,
    plan: input.plan,
    role: input.role,
    exp: Math.floor(Date.now() / 1000) + (input.ttlSec ?? 300),
  };
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyHandoffToken(token: string): HandoffPayload | null {
  const secret = handoffSecret();
  if (!secret || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as HandoffPayload;
    if (!payload.sub || !payload.email || !payload.exp) return null;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Session user, handoff JWT, or platform service + X-User-Id. */
export async function resolvePlatformActor(request: Request): Promise<{
  userId: string;
  email?: string;
  via: "session" | "handoff" | "service";
} | null> {
  const session = await auth();
  if (session?.user?.id) {
    return {
      userId: session.user.id,
      email: session.user.email || undefined,
      via: "session",
    };
  }

  const handoff =
    request.headers.get("x-ditodio-handoff") ||
    new URL(request.url).searchParams.get("handoff");
  if (handoff) {
    const payload = verifyHandoffToken(handoff);
    if (payload) {
      return { userId: payload.sub, email: payload.email, via: "handoff" };
    }
  }

  if (verifyPlatformServiceRequest(request)) {
    const userId = request.headers.get("x-user-id")?.trim();
    if (userId) return { userId, via: "service" };
  }

  return null;
}
