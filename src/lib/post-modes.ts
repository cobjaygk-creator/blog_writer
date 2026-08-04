export const POST_MODES = ["worklog", "topic", "product"] as const;
export type PostModeId = (typeof POST_MODES)[number];

export function isPostMode(value: unknown): value is PostModeId {
  return typeof value === "string" && (POST_MODES as readonly string[]).includes(value);
}

export function normalizePostMode(value: unknown): PostModeId {
  return isPostMode(value) ? value : "worklog";
}

export const POST_MODE_META: Record<
  PostModeId,
  { title: string; description: string; example: string; badge: string }
> = {
  worklog: {
    title: "시공 · 후기",
    description: "내가 찍은 사진으로 작업기를 씁니다",
    example: "AG바디킷 장착 후기",
    badge: "시공 · 후기",
  },
  topic: {
    title: "주제 · 정보",
    description: "주제만 있으면 설명 글을 씁니다",
    example: "현재 주가가 내리는 이유",
    badge: "주제 · 정보",
  },
  product: {
    title: "제품 · 리뷰",
    description: "제품명 중심으로 소개/장단점을 씁니다",
    example: "OO 사이드스텝 장단점",
    badge: "제품 · 리뷰",
  },
};
