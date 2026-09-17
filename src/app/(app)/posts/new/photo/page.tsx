import { PhotoWizard } from "@/components/studio/PhotoWizard";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function NewPhotoPostPage() {
  const session = await auth();
  const userId = session!.user!.id;

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
      <PhotoWizard voices={voices} />
    </main>
  );
}
