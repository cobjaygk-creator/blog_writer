import { redirect } from "next/navigation";

import { OnboardingWizard } from "@/components/onboarding/OnboardingWizard";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function OnboardingPage() {
  const session = await auth();
  const userId = session!.user!.id;

  // Already has a voice — onboarding's job is done; don't create a second one.
  const existing = await prisma.brand.count({ where: { userId } }).catch(() => 0);
  if (existing > 0) {
    redirect("/dashboard");
  }

  return <OnboardingWizard />;
}
