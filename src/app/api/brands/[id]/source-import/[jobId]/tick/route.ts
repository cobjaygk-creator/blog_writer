import { NextResponse } from "next/server";

import { getOwnedBrand, jsonError, requireUserId } from "@/lib/api-helpers";
import { fetchSourceFromUrl } from "@/lib/fetch-source";
import { indexFieldsFromSourceText } from "@/lib/learned-supplement";
import type { SourceImportItem } from "@/lib/naver-blog";
import { getRemainingSourceSlots } from "@/lib/plan-guards";
import { prisma } from "@/lib/prisma";
import { runStyleLearnForBrand } from "@/lib/style-learn";

const CHUNK = 5;

type Params = { params: Promise<{ id: string; jobId: string }> };

function asItems(raw: unknown): SourceImportItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is SourceImportItem => Boolean(x && typeof x === "object" && "url" in x));
}

function recount(items: SourceImportItem[]) {
  return {
    fetchedCount: items.filter((i) => i.status === "fetched").length,
    skippedCount: items.filter((i) => i.status === "skipped").length,
    failedCount: items.filter((i) => i.status === "failed").length,
  };
}

export async function POST(_request: Request, { params }: Params) {
  const { userId, error } = await requireUserId();
  if (error) return error;

  const { id, jobId } = await params;
  const owned = await getOwnedBrand(id, userId!);
  if (!owned) return jsonError("테마를 찾을 수 없습니다.", 404);

  const job = await prisma.sourceImportJob.findFirst({
    where: { id: jobId, brandId: id },
  });
  if (!job) return jsonError("가져오기 작업을 찾을 수 없습니다.", 404);

  if (job.status === "completed" || job.status === "failed" || job.status === "learning") {
    return NextResponse.json({ job });
  }

  const items = asItems(job.itemsJson);
  const pendingIndexes = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.status === "pending")
    .slice(0, CHUNK);

  for (const { item, index } of pendingIndexes) {
    const remaining = await getRemainingSourceSlots(userId!, id);
    if (remaining === "suspended") {
      items[index] = { ...item, status: "skipped", error: "계정 정지" };
      continue;
    }
    if (remaining !== null && remaining <= 0) {
      items[index] = { ...item, status: "skipped", error: "원문 한도 초과" };
      continue;
    }

    const existing = await prisma.sourcePost.findFirst({
      where: {
        brandId: id,
        OR: [{ sourceUrl: item.url }, { externalId: item.logNo }],
      },
      select: { id: true },
    });
    if (existing) {
      items[index] = {
        ...item,
        status: "skipped",
        sourcePostId: existing.id,
        error: "이미 등록된 글",
      };
      continue;
    }

    try {
      const fetched = await fetchSourceFromUrl(item.url);
      const publishedAt = item.publishedAt ? new Date(item.publishedAt) : null;
      const title = item.title || fetched.title;
      const sourcePost = await prisma.sourcePost.create({
        data: {
          brandId: id,
          rawText: fetched.text,
          sourceUrl: item.url,
          title,
          publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
          externalId: item.logNo,
        },
      });
      const productIndex = indexFieldsFromSourceText(title, fetched.text);
      if (productIndex.productKey) {
        try {
          await prisma.$executeRaw`
            UPDATE "SourcePost"
            SET vehicle = ${productIndex.vehicle},
                part = ${productIndex.part},
                "productKey" = ${productIndex.productKey}
            WHERE id = ${sourcePost.id}
          `;
        } catch {
          /* optional index */
        }
      }
      items[index] = {
        ...item,
        status: "fetched",
        sourcePostId: sourcePost.id,
        title: sourcePost.title,
      };
    } catch (e) {
      items[index] = {
        ...item,
        status: "failed",
        error: e instanceof Error ? e.message : "본문 추출 실패",
      };
    }
  }

  const counts = recount(items);
  const stillPending = items.some((i) => i.status === "pending");

  if (stillPending) {
    const updated = await prisma.sourceImportJob.update({
      where: { id: jobId },
      data: {
        status: "fetching",
        itemsJson: items,
        ...counts,
      },
    });
    return NextResponse.json({ job: updated });
  }

  const canLearn =
    job.autoLearn &&
    (counts.fetchedCount >= 3 || (counts.fetchedCount >= 1 && items.length < 3));

  if (canLearn) {
    await prisma.sourceImportJob.update({
      where: { id: jobId },
      data: {
        status: "learning",
        itemsJson: items,
        ...counts,
      },
    });

    try {
      await runStyleLearnForBrand(id);
      const completed = await prisma.sourceImportJob.update({
        where: { id: jobId },
        data: { status: "completed", error: null, itemsJson: items, ...counts },
      });
      return NextResponse.json({ job: completed });
    } catch (e) {
      const completed = await prisma.sourceImportJob.update({
        where: { id: jobId },
        data: {
          status: "completed",
          itemsJson: items,
          ...counts,
          error: e instanceof Error ? `수집은 완료됐으나 학습 실패: ${e.message}` : "학습 실패",
        },
      });
      return NextResponse.json({ job: completed });
    }
  }

  const completed = await prisma.sourceImportJob.update({
    where: { id: jobId },
    data: {
      status: "completed",
      itemsJson: items,
      ...counts,
      error: counts.fetchedCount === 0 ? "가져오기에 성공한 글이 없습니다." : null,
    },
  });

  return NextResponse.json({ job: completed });
}
