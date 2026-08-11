import { redirect } from "next/navigation";

import { AppNav } from "@/components/AppNav";
import { StudioShell } from "@/components/studio/StudioShell";
import { adminEmails } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { isUnlimitedEmail, normalizePlan } from "@/lib/plans";
import { isStudioUiEnabled } from "@/lib/studio-ui";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const plan = normalizePlan(session.user.plan);
  const unlimited = isUnlimitedEmail(session.user.email);
  const planLabel = unlimited ? "unlimited" : plan;
  const isAdmin =
    session.user.role === "admin" ||
    Boolean(session.user.email && adminEmails().has(session.user.email.trim().toLowerCase()));

  if (isStudioUiEnabled()) {
    return (
      <StudioShell email={session.user.email} planLabel={planLabel} isAdmin={isAdmin}>
        {children}
      </StudioShell>
    );
  }

  return (
    <div className="min-h-full bg-[var(--background)]">
      <AppNav email={session.user.email} planLabel={planLabel} isAdmin={isAdmin} />
      {children}
    </div>
  );
}
