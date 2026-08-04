export const POST_STATUS_LABELS: Record<string, string> = {
  collecting: "수집 중",
  draft: "초안",
  published: "올림 완료",
  archived: "보관됨",
};

export function postStatusLabel(status: string) {
  return POST_STATUS_LABELS[status] || status;
}
