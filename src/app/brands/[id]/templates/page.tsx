import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppNav } from "@/components/AppNav";
import { BrandTemplateWorkspace } from "@/components/BrandTemplateWorkspace";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Props = { params: Promise<{ id: string }> };

export default async function BrandTemplatesPage({ params }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const brand = await prisma.brand.findFirst({
    where: { id, userId: session.user.id },
    include: {
      templates: {
        orderBy: [{ kind: "asc" }, { updatedAt: "desc" }],
      },
    },
  });

  if (!brand) notFound();

  return (
    <>
      <AppNav email={session.user.email} />
      <main className="mx-auto w-full max-w-3xl px-6 py-10">
        <Link href={`/brands/${brand.id}`} className="text-sm text-zinc-500 hover:text-zinc-800">
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
    </>
  );
}
