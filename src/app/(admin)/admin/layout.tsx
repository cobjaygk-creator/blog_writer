import { redirect } from "next/navigation";

import { AdminShell } from "@/components/AdminShell";
import { adminEmails } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, role: true },
  });

  const isAdmin =
    user?.role === "admin" ||
    (user?.email ? adminEmails().has(user.email.trim().toLowerCase()) : false);

  if (!isAdmin) redirect("/dashboard");

  if (user && user.role !== "admin") {
    await prisma.user.update({
      where: { id: session.user.id },
      data: { role: "admin" },
    });
  }

  return <AdminShell email={user?.email}>{children}</AdminShell>;
}
