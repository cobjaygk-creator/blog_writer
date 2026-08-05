import Link from "next/link";
import { notFound } from "next/navigation";

import { BrandTemplateWorkspace } from "@/components/BrandTemplateWorkspace";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ id: string }> };

export default async function BrandTemplatesPage({ params }: Props) {
  const session = await auth();
  const { id } = await params;
  const brand = await prisma.brand.findFirst({
    where: { id, userId: session!.user!.id },
    include: {
      templates: {
        orderBy: [{ kind: "asc" }, { updatedAt: "desc" }],
      },
    },
  });

  if (!brand) notFound();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <Link href={`/brands/${brand.id}`} className="text-sm text-[color:var(--muted)] hover:text-[var(--accent)]">
        ← {brand.name}
      </Link>
      <div className="mt-6">
        <BrandTemplateWorkspace
          brandId={brand.id}
          brandName={brand.name}
          initialTemplates={brand.templates.map((t) => ({
            id: t.id,
            name: t.name,
            kind: t.kind,
            html: t.html,
            updatedAt: t.updatedAt.toISOString(),
          }))}
        />
      </div>
    </main>
  );
}
