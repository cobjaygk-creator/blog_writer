import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

/** Onboarding hides the rail/usage chrome entirely — one decision per screen. */
export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return <div className="min-h-[100dvh] bg-[#F3F3F5]">{children}</div>;
}
