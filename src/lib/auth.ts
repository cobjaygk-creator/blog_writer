import { compare, hash } from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { adminEmails } from "@/lib/admin";
import { authConfig } from "@/lib/auth.config";
import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase().trim();
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        if (user.suspendedAt) return null;

        const ok = await compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        let role = user.role;
        if (role !== "admin" && adminEmails().has(email)) {
          await prisma.user.update({ where: { id: user.id }, data: { role: "admin" } });
          role = "admin";
        }

        return {
          id: user.id,
          email: user.email,
          plan: user.plan,
          role,
        };
      },
    }),
  ],
});

export async function hashPassword(password: string): Promise<string> {
  return hash(password, 12);
}
