import { normalizeTraitsJson } from "@/lib/style-traits";
import { prisma } from "@/lib/prisma";

/** Always use the brand's learned StyleTraits.tone (no per-post tone override). */
export async function getPostCaptionTone(
  _postId: string,
  brandId: string,
  _storedTone?: string | null,
) {
  const style = await prisma.styleProfile.findUnique({
    where: { brandId },
    select: { traitsJson: true },
  });
  return normalizeTraitsJson(style?.traitsJson).tone;
}
