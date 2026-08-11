/**
 * Pure-function smoke for learned content supplement (A-stage).
 * No LLM / DB — resolveProductKey, filterSameProductSources, matchParagraphsToImagePrompts.
 */
import {
  filterSameProductSources,
  learnedSupplementMaxPoints,
  matchParagraphsToImagePrompts,
  resolveProductKey,
} from "../src/lib/learned-supplement";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const key = resolveProductKey({
  keyword: "카니발 KA4 AG바디킷",
  notes: "작업 전 손상 확인",
  productName: "카니발 KA4 AG바디킷",
});
assert(key, "expected product key for 카니발 KA4 바디킷");
assert(key.confidence >= 0.55, `confidence too low: ${key.confidence}`);
assert(/ka4/i.test(key.vehicle) || /카니발/.test(key.vehicle), `vehicle=${key.vehicle}`);
assert(/바디킷/i.test(key.part), `part=${key.part}`);

const otherKey = resolveProductKey({
  keyword: "쏘렌토 MQ4 루프박스",
  notes: "",
});
assert(otherKey, "expected key for 쏘렌토 루프박스");
assert(otherKey.productKey !== key.productKey, "different products should differ");

const weak = resolveProductKey({ keyword: "후기", notes: "시공" });
assert(!weak || weak.confidence < 0.55, "generic keyword should not pass gate");

const sources = [
  {
    id: "s1",
    title: "카니발 KA4 AG바디킷 시공",
    rawText:
      "작업 전 손상 여부를 확인하고 시공 가능 상태를 점검했습니다.\n\n순정 범퍼를 탈거한 뒤 AG바디킷을 장착했습니다.\n\n마감 후 완성 샷을 남겼습니다.",
  },
  {
    id: "s2",
    title: "카니발 KA4 바디킷 후기",
    rawText:
      "사전 점검에서 간섭 여유를 확인했습니다.\n\n볼트 체결로 바디킷을 고정하고 정렬했습니다.",
  },
  {
    id: "s3",
    title: "쏘렌토 MQ4 루프박스",
    rawText: "루프박스 장착 전 루프랙을 점검하고 장착했습니다.",
  },
];

const same = filterSameProductSources(sources, key);
assert(same.length >= 2, `same-product filter expected >=2, got ${same.length}`);
assert(
  same.every((s) => /카니발|ka4|바디킷/i.test(`${s.title}\n${s.rawText}`)),
  "filtered sources must mention carnival/bodykit",
);
assert(!same.some((s) => s.id === "s3"), "쏘렌토 루프박스 must be excluded");

const matched = matchParagraphsToImagePrompts(same, [
  "작업 전 손상 확인 · 시공 가능 점검",
  "바디킷 장착 · 볼트 체결",
]);
assert(matched.length > 0, "expected matched paragraphs for image prompts");
assert(
  matched.some((m) => /손상|점검|시공/.test(m.text)),
  "precheck prompt should match precheck paragraphs",
);

const maxPts = learnedSupplementMaxPoints();
assert(maxPts >= 3 && maxPts <= 8, `max points clamp 3-8, got ${maxPts}`);

console.log("ok learned-supplement smoke", {
  productKey: key.productKey,
  sameCount: same.length,
  matchedCount: matched.length,
  maxPoints: maxPts,
});
