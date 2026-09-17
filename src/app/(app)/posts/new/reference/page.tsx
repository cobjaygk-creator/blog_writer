import { ReferenceWizard } from "@/components/studio/ReferenceWizard";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Props = { searchParams: Promise<{ url?: string }> };

export default async function NewReferencePostPage({ searchParams }: Props) {
  const session = await auth();
  const userId = session!.user!.id;
  const { url } = await searchParams;

  const brands = await prisma.brand.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, styleProfile: { select: { version: true } } },
  });
  const voices = brands.map((b) => ({
    id: b.id,
    name: b.name,
    version: b.styleProfile?.version ?? null,
  }));

  return (
    <main className="h-full min-h-0">
      <ReferenceWizard key={url || "none"} initialUrl={url || ""} voices={voices} />
    </main>
  );
}
