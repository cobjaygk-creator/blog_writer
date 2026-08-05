/** Target / soft-ceiling percents for generation UI (client-safe). */

export type ProgressKind = "generate" | "generate_topic" | "wizard";

/** Floor percent when a phase starts; display eases up to soft ceiling while waiting. */
export function phaseProgressRange(
  phase: string,
  kind: ProgressKind = "generate",
): { floor: number; ceiling: number } {
  if (kind === "wizard") {
    switch (phase) {
      case "create":
        return { floor: 4, ceiling: 16 };
      case "upload":
        return { floor: 16, ceiling: 42 };
      case "generate":
        return { floor: 42, ceiling: 52 };
      default:
        return { floor: 8, ceiling: 20 };
    }
  }

  if (kind === "generate_topic") {
    switch (phase) {
      case "pending":
        return { floor: 2, ceiling: 8 };
      case "research":
        return { floor: 8, ceiling: 22 };
      case "plan":
        return { floor: 22, ceiling: 36 };
      case "images":
        return { floor: 36, ceiling: 55 };
      case "draft":
      case "draft_gpt":
      case "draft_gemini":
        return { floor: 55, ceiling: 82 };
      case "style_repair":
        return { floor: 82, ceiling: 90 };
      case "seo_score":
        return { floor: 90, ceiling: 94 };
      case "persist":
        return { floor: 94, ceiling: 98 };
      case "completed":
        return { floor: 100, ceiling: 100 };
      default:
        return { floor: 10, ceiling: 30 };
    }
  }

  // worklog / product generate
  switch (phase) {
    case "pending":
      return { floor: 2, ceiling: 8 };
    case "assemble":
      return { floor: 8, ceiling: 24 };
    case "draft":
    case "draft_gpt":
    case "draft_gemini":
      return { floor: 24, ceiling: 78 };
    case "style_repair":
      return { floor: 78, ceiling: 88 };
    case "seo_score":
      return { floor: 88, ceiling: 93 };
    case "persist":
      return { floor: 93, ceiling: 98 };
    case "completed":
      return { floor: 100, ceiling: 100 };
    default:
      return { floor: 10, ceiling: 30 };
  }
}

export function wizardUploadTarget(done: number, total: number): number {
  const { floor, ceiling } = phaseProgressRange("upload", "wizard");
  if (total <= 0) return floor;
  const t = Math.min(1, Math.max(0, done / total));
  return floor + (ceiling - floor) * t;
}
