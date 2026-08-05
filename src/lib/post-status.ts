export const POST_STATUS_LABELS: Record<string, string> = {
  collecting: "준비 중",
  draft: "초안",
  published: "올림 완료",
  archived: "보관됨",
};

export const POST_STATUS_HINTS: Record<string, string> = {
  collecting: "글·사진 준비 단계입니다. 초안이 만들어지기 전에는 본문 편집이 제한될 수 있어요.",
  draft: "편집·복사 후 외부 블로그에 직접 올릴 수 있어요.",
  published: "외부(네이버/티스토리 등)에 직접 올린 뒤, 여기서 표시만 한 상태입니다.",
  archived: "목록에서 덜 보이게 보관한 글입니다.",
};

export function postStatusLabel(status: string) {
  return POST_STATUS_LABELS[status] || status;
}

export function postStatusHint(status: string) {
  return POST_STATUS_HINTS[status] || "";
}
