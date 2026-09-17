"use client";

export function GeneratingOverlay({
  label,
  pct,
}: {
  label: string;
  pct: number;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 bg-[#16161A] px-8 text-white">
      <span className="text-[12px] font-bold tracking-[.09em] text-[#8B8B98]">
        초안 만드는 중
      </span>
      <h2 className="max-w-[420px] text-center text-[24px] font-bold leading-[1.4]">
        {label}
      </h2>
      <div className="flex w-full max-w-[320px] flex-col gap-2">
        <div className="h-[6px] overflow-hidden rounded-full bg-[#26262f]">
          <div
            className="h-full rounded-full bg-[#4C8DFF] transition-[width] duration-500"
            style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
          />
        </div>
        <span className="text-center text-[12.5px] text-[#8b8b98]">
          창을 닫지 마세요 · 완료되면 자동으로 이어집니다
        </span>
      </div>
    </div>
  );
}
