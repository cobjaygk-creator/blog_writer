import { extractCorpusSignals } from "@/lib/corpus-signals";
import { learnStyleFromSources } from "@/lib/llm";
import { STYLE_LEARN_MIN_CHARS, STYLE_LEARN_SAMPLE_SIZE } from "@/lib/plans";
import { prisma } from "@/lib/prisma";
import { normalizeExtendedTraits } from "@/lib/style-traits";

function isNoisySource(text: string) {
  const markers = ["블로그 주소 변경 불가", "이웃을 맺으면", "퀵에디터", "이 블로그에서 검색"];
  return markers.filter((m) => text.includes(m)).length >= 2;
}

export async function runStyleLearnForBrand(brandId: string) {
  const sourcePosts = await prisma.sourcePost.findMany({
    where: { brandId },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    select: { id: true, rawText: true, title: true, publishedAt: true, createdAt: true },
  });

  const clean = sourcePosts.filter(
    (s) => s.rawText.trim().length >= STYLE_LEARN_MIN_CHARS && !isNoisySource(s.rawText),
  );

  const samples = clean.slice(0, STYLE_LEARN_SAMPLE_SIZE);

  if (samples.length === 0) {
    throw new Error("학습할 원문이 없습니다. 먼저 원문을 등록하세요.");
  }

  const learned = await learnStyleFromSources(
    samples.map((s) => ({ id: s.id, rawText: s.rawText })),
  );

  const signals = await extractCorpusSignals(
    clean.slice(0, 40).map((s) => ({ title: s.title, rawText: s.rawText })),
  );

  const traitsJson = {
    ...normalizeExtendedTraits({
      ...learned.traitsJson,
      ...signals,
    }),
  };

  const existing = await prisma.styleProfile.findUnique({ where: { brandId } });

  // Business path: re-learn updates tone from corpus (no manual tone lock).
  const styleProfile = existing
    ? await prisma.styleProfile.update({
        where: { brandId },
        data: {
          summaryText: learned.summaryText,
          sampleAnchors: learned.sampleAnchors,
          traitsJson,
          version: existing.version + 1,
        },
      })
    : await prisma.styleProfile.create({
        data: {
          brandId,
          summaryText: learned.summaryText,
          sampleAnchors: learned.sampleAnchors,
          traitsJson,
        },
      });

  return { styleProfile, meta: learned.meta, sampleCount: samples.length };
}
