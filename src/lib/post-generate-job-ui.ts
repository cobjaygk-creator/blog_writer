/** Client-safe labels for generation job phases (no Prisma / Node imports). */

export function phaseStatusLabel(
  phase: string,
  kind: "generate" | "generate_topic" | "generate_reference" = "generate",
) {
  switch (phase) {
    case "pending":
      return "생성 대기";
    case "assemble":
      return kind === "generate"
        ? "자료·문체 준비 · 보통 10~30초"
        : "준비 중";
    case "reference":
      return "참고 글 불러오기 · 보통 5~20초";
    case "research":
      return "웹 자료 조사 · 보통 10~30초";
    case "plan":
      return "글 구성 기획 · 보통 10~20초";
    case "images":
      return "이미지 준비 · 보통 15~40초";
    case "draft_gpt":
      return "A/B 초안 동시 생성 · 보통 30~90초";
    case "draft_gemini":
      return "A/B 초안 동시 생성 · 보통 30~90초";
    case "draft":
      return "A/B 초안 동시 생성 · 보통 30~90초";
    case "style_repair":
      return "문체·SEO 점검 · 보통 15~40초";
    case "seo_score":
      return "SEO 점검 · 보통 10~30초";
    case "persist":
      return "결과 저장 중";
    case "completed":
      return "완료";
    default:
      return "생성 중";
  }
}
