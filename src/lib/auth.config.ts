import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config (no Prisma). Used by middleware.
 * Credentials provider + DB live in auth.ts.
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      const isLoggedIn = Boolean(auth?.user);
      const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register");
      const isPublic =
        pathname === "/" ||
        pathname.startsWith("/api/auth") ||
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
