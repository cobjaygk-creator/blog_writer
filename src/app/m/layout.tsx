import { redirect } from "next/navigation";

import { MobileTabBar } from "@/components/mobile/MobileTabBar";
import { auth } from "@/lib/auth";

export default async function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col bg-white">
      {children}
      <MobileTabBar />
    </div>
  );
}
