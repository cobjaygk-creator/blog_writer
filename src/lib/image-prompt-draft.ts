/**
 * Draft per-image scene prompts for worklog/product posts.
 * Multi-image: unique stage per slot, product name once, no repeated filler.
 */

export type ImagePromptStage = {
  id: string;
  label: string;
  intents: string[];
};

/** Ordered install narrative — one distinct beat per photo when possible. */
export const IMAGE_PROMPT_STAGES: ImagePromptStage[] = [
  {
    id: "arrival",
    label: "입고·작업 전 전체 상태 확인",
    intents: ["입고", "작업 전", "전체", "상태", "세차"],
  },
  {
    id: "precheck",
    label: "손상·간섭·시공 가능 여부 점검",
    intents: ["손상", "시공 가능", "사전", "점검", "간섭", "여유"],
  },
  {
    id: "wash",
    label: "세차·오염 제거·작업면 정리",
    intents: ["세차", "오염", "클리닝", "세척", "물기"],
  },
  {
    id: "remove",
    label: "순정 부품 탈거·분해",
    intents: ["탈거", "분해", "분리", "순정", "제거"],
  },
  {
    id: "prep",
    label: "장착 전 피팅 자리·브라켓 준비",
    intents: ["준비", "브라켓", "자리", "가조립", "피팅"],
  },
  {
    id: "install",
    label: "제품 본장착·볼트 체결",
    intents: ["장착", "조립", "볼트", "체결", "고정"],
  },
  {
    id: "align",
    label: "좌우 유격·라인 정렬 조정",
    intents: ["정렬", "유격", "라인", "맞춤", "수평"],
  },
  {
    id: "finish",
    label: "마감·실리콘·디테일 정리",
    intents: ["마감", "실리콘", "디테일", "도장", "정리"],
  },
  {
    id: "detail",
    label: "근접 디테일·마감면 확인",
    intents: ["디테일", "근접", "마감면", "틈새", "마감"],
  },
  {
    id: "complete",
    label: "완성·전체 샷·출고 전 최종 확인",
    intents: ["완성", "출고", "최종", "완료", "전체", "결과"],
  },
];

function normalize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitParts(text: string): string[] {
  return text
    .split(/\s*[·•|,/]\s*|\n+/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 2);
}

/** Drop parts that are duplicates or near-substrings of earlier parts. */
export function dedupePromptParts(parts: string[]): string[] {
  const out: string[] = [];
  for (const raw of parts) {
    const part = raw.replace(/\s+/g, " ").trim();
    if (!part) continue;
    const n = normalize(part);
    if (n.length < 2) continue;
    const redundant = out.some((prev) => {
      const pn = normalize(prev);
      if (pn === n) return true;
      if (pn.includes(n) && n.length >= 4) return true;
      if (n.includes(pn) && pn.length >= 4) return true;
      const a = new Set(pn.split(" ").filter((t) => t.length >= 2));
      const b = n.split(" ").filter((t) => t.length >= 2);
      if (!a.size || !b.length) return false;
      const hit = b.filter((t) => a.has(t)).length;
      return hit / b.length >= 0.75 && hit >= 2;
    });
    if (!redundant) out.push(part);
  }
  return out;
}

export function compactProductPhrase(keyword: string, notes?: string | null): string {
  const k = keyword.trim().replace(/\s+/g, " ");
  if (!k) return "";
  const noteParts = splitParts(notes || "").filter((p) => {
    const n = normalize(p);
    const kn = normalize(k);
    if (!n || n === kn) return false;
    if (kn.includes(n) || n.includes(kn)) return false;
    return p.length <= 40;
  });
  return dedupePromptParts([k, ...noteParts.slice(0, 1)]).join(" ").slice(0, 80);
}

/**
 * Spread N photos across the stage list so each index gets a distinct beat.
 * Sequence order is authoritative (vision must not collapse all to "장착").
 */
export function pickSequenceStage(orderIndex: number, totalCount: number): ImagePromptStage {
  const stages = IMAGE_PROMPT_STAGES;
  const n = Math.max(1, totalCount);
  const i = Math.max(0, Math.min(n - 1, orderIndex));
  if (n === 1) return stages[0];
  if (n >= stages.length) {
    // More photos than stages: walk through, then add angle variants on overflow
    return stages[i % stages.length];
  }
  // Evenly sample unique stages in order
  const idx = Math.round((i * (stages.length - 1)) / (n - 1));
  return stages[Math.min(stages.length - 1, idx)];
}

/** Soft angle/view cue from vision — never product keyword repeats. */
const VIEW_HINTS: Array<{ re: RegExp; label: string }> = [
  { re: /전면|앞/, label: "전면" },
  { re: /후면|뒷|리어/, label: "후면" },
  { re: /측면|사이드/, label: "측면" },
  { re: /하단|하부|언더/, label: "하단" },
  { re: /휠|타이어/, label: "휠 주변" },
  { re: /범퍼/, label: "범퍼" },
  { re: /그릴/, label: "그릴" },
  { re: /세차|세척/, label: "세차 중" },
  { re: /야간|밤|라이트|헤드램프/, label: "라이트 점등" },
  { re: /실내|내부/, label: "실내" },
  { re: /근접|클로즈|디테일/, label: "근접" },
];

export function uniqueVisionSceneBits(
  visionCaption: string | null | undefined,
  keyword: string,
  notes?: string | null,
): string[] {
  const raw = (visionCaption || "").trim();
  if (!raw) return [];

  // If caption already looks like a drafted prompt, don't re-parse product·stage soup
  if (/작업 전|장착|탈거|마감|완성|시공 가능|본장착/.test(raw) && raw.includes("·")) {
    const view = VIEW_HINTS.find((h) => h.re.test(raw));
    return view ? [view.label] : [];
  }

  const productN = normalize(`${keyword} ${notes || ""}`);
  const fromParts = dedupePromptParts(
    splitParts(raw).filter((bit) => {
      const n = normalize(bit);
      if (n.length < 2 || n.length > 24) return false;
      if (productN && (productN.includes(n) || n.includes(productN))) return false;
      const tokens = n.split(" ").filter((t) => t.length >= 2);
      if (!tokens.length) return false;
      const productHits = tokens.filter((t) => productN.includes(t)).length;
      if (productHits / tokens.length >= 0.5) return false;
      return true;
    }),
  );

  if (fromParts.length) return fromParts.slice(0, 2);

  const view = VIEW_HINTS.find((h) => h.re.test(raw));
  return view ? [view.label] : [];
}

export function compressLearnedHint(raw: string, maxLen = 40): string {
  const one = raw
    .replace(/\s+/g, " ")
    .replace(/^[•\-\d.)\s]+/, "")
    .trim();
  if (!one) return "";
  // Strip product-like long proper nouns already in keyword context
  if (one.length <= maxLen) return one;
  const cut = one.slice(0, maxLen);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 16 ? cut.slice(0, sp) : cut).trim()}…`;
}

function angleVariant(orderIndex: number, totalCount: number): string | null {
  if (totalCount <= IMAGE_PROMPT_STAGES.length) return null;
  const variants = ["다른 각도", "근접", "전체 구도", "작업 중 모습"];
  return variants[orderIndex % variants.length] || null;
}

export function draftImagePrompt(input: {
  keyword: string;
  notes?: string | null;
  visionCaption?: string | null;
  orderIndex: number;
  totalCount: number;
  learnedHint?: string | null;
  /** Include product name only on the first photo (default true for index 0). */
  includeProduct?: boolean;
}): string {
  const includeProduct =
    input.includeProduct ?? input.orderIndex === 0;
  const product = includeProduct
    ? compactProductPhrase(input.keyword, input.notes)
    : "";
  // Sequence is authoritative — do not let vision collapse every slot to "장착"
  const stage = pickSequenceStage(input.orderIndex, input.totalCount);
  const visionBits = uniqueVisionSceneBits(
    input.visionCaption,
    input.keyword,
    input.notes,
  );
  const learned = input.learnedHint?.trim()
    ? compressLearnedHint(input.learnedHint)
    : "";
  const angle = angleVariant(input.orderIndex, input.totalCount);

  const parts = dedupePromptParts([
    product,
    stage.label,
    ...visionBits,
    angle || "",
    learned,
  ]);

  return parts.join(" · ").slice(0, 160);
}

export type DraftPromptItemInput = {
  id: string;
  visionCaption?: string | null;
  learnedHint?: string | null;
};

/**
 * Draft a full set so prompts stay distinct across the gallery.
 */
export function draftImagePromptsBatch(input: {
  keyword: string;
  notes?: string | null;
  images: DraftPromptItemInput[];
}): Array<{ imageId: string; prompt: string; stage: string }> {
  const total = input.images.length;
  const usedNormalized = new Set<string>();
  const usedLearned = new Set<string>();
  const out: Array<{ imageId: string; prompt: string; stage: string }> = [];

  for (let i = 0; i < total; i += 1) {
    const img = input.images[i];
    const stage = pickSequenceStage(i, total);
    let learned = img.learnedHint?.trim() || "";
    const learnedN = normalize(learned).slice(0, 40);
    if (learnedN && usedLearned.has(learnedN)) learned = "";
    if (learnedN) usedLearned.add(learnedN);

    let prompt = draftImagePrompt({
      keyword: input.keyword,
      notes: input.notes,
      visionCaption: img.visionCaption,
      orderIndex: i,
      totalCount: total,
      learnedHint: learned,
      includeProduct: i === 0,
    });

    // Guarantee uniqueness vs prior prompts
    let guard = 0;
    while (usedNormalized.has(normalize(prompt)) && guard < 4) {
      guard += 1;
      prompt = draftImagePrompt({
        keyword: input.keyword,
        notes: input.notes,
        visionCaption: img.visionCaption,
        orderIndex: i,
        totalCount: total,
        learnedHint: learned,
        includeProduct: false,
      });
      const suffix = ["다른 시점", "작업 포인트", "확인 컷", "진행 장면"][guard - 1];
      prompt = dedupePromptParts([prompt, suffix]).join(" · ").slice(0, 160);
    }
    usedNormalized.add(normalize(prompt));
    out.push({ imageId: img.id, prompt, stage: stage.id });
  }

  return out;
}
