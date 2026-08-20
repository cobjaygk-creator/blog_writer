import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config (no Prisma). Used by middleware.
 * Credentials provider + DB live in auth.ts.
 *
 * Cross-subdomain SSO: set AUTH_COOKIE_DOMAIN=.ditodio.com in production
 * so app.ditodio.com and shorts.ditodio.com share the session.
 */
const cookieDomain = process.env.AUTH_COOKIE_DOMAIN?.trim() || undefined;
const useSecureCookies =
  process.env.AUTH_URL?.startsWith("https://") ||
  process.env.NEXTAUTH_URL?.startsWith("https://");

export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [],
  cookies: cookieDomain
    ? {
        sessionToken: {
          name: useSecureCookies
            ? "__Secure-authjs.session-token"
            : "authjs.session-token",
          options: {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            secure: useSecureCookies,
            domain: cookieDomain,
          },
        },
      }
    : undefined,
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = Boolean(auth?.user);
      const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register");
      const isPublic =
        pathname === "/" ||
        pathname.startsWith("/uploads") ||
        pathname.startsWith("/api/auth") ||
        pathname.startsWith("/api/platform") ||
        pathname === "/api/health" ||
        isAuthPage;

      if (isPublic) return true;
      return isLoggedIn;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
        token.plan = typeof user.plan === "string" ? user.plan : "free";
        token.role = typeof (user as { role?: string }).role === "string"
          ? (user as { role?: string }).role
          : "user";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.sub === "string" ? token.sub : "";
        session.user.plan = typeof token.plan === "string" ? token.plan : "free";
        session.user.role = typeof token.role === "string" ? token.role : "user";
      }
      return session;
    },
  },
  trustHost: true,
} satisfies NextAuthConfig;
