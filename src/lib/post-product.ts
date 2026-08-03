import { buildProductFactCard, matchHighlightToScene, type ProductFactCard } from "@/lib/product-facts";
import { prisma } from "@/lib/prisma";

/** Ensure post has a cached product fact card; rebuild when user highlights change. */
export async function ensurePostProductFacts(post: {
  id: string;
  keyword?: string | null;
  productHighlights?: string | null;
  productFactsJson?: unknown;
}): Promise<ProductFactCard> {
  const facts = await buildProductFactCard({
    keyword: post.keyword,
    productHighlights: post.productHighlights,
    cached: post.productFactsJson,
  });

  const prev = post.productFactsJson as Partial<ProductFactCard> | null;
  const changed =
    !prev ||
    prev.productName !== facts.productName ||
    JSON.stringify(prev.highlights || []) !== JSON.stringify(facts.highlights) ||
    prev.source !== facts.source;

  if (changed) {
    await prisma.post.update({
      where: { id: post.id },
      data: { productFactsJson: facts },
    });
  }

  return facts;
}

export async function factHighlightForCaption(
  sceneHint: string,
  facts: ProductFactCard,
): Promise<string | null> {
  return matchHighlightToScene(sceneHint, facts);
}
