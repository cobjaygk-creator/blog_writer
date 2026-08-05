/** Browser helper: create generation job and tick until terminal. */

export type ClientJob = {
  id: string;
  postId: string;
  kind: "generate" | "generate_topic";
  status: "pending" | "running" | "completed" | "failed";
  phase: string;
  error: string | null;
  result: {
    needsSelection?: boolean;
    drafts?: Array<{
      id: string;
      provider: string;
      modelId?: string;
      title: string | null;
      titleCandidates?: unknown;
      body: string;
      isSelected: boolean;
      label?: string;
    }>;
    meta?: {
      failed?: Array<{ provider: string; error: string } | string>;
      dual?: boolean;
      [key: string]: unknown;
    };
    productFacts?: unknown;
  } | null;
};

export type RunGenerationJobOptions = {
  postId: string;
  body: Record<string, unknown>;
  onPhase?: (job: ClientJob) => void;
  tickDelayMs?: number;
};

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/** Create job only — editor resumes ticks (wizard handoff). */
export async function startGenerationJobClient(
  postId: string,
  body: Record<string, unknown>,
): Promise<ClientJob> {
  const createRes = await fetch(`/api/posts/${postId}/generate-jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const createData = (await createRes.json().catch(() => ({}))) as {
    error?: string;
    job?: ClientJob;
  };
  if (!createRes.ok || !createData.job) {
    throw new Error(createData.error || "생성 작업을 시작하지 못했습니다.");
  }
  return createData.job;
}

export async function runGenerationJobClient(
  options: RunGenerationJobOptions,
): Promise<ClientJob> {
  const { postId, body, onPhase, tickDelayMs = 350 } = options;

  let job = await startGenerationJobClient(postId, body);
  onPhase?.(job);

  while (job.status === "pending" || job.status === "running") {
    await sleep(tickDelayMs);
    const tickRes = await fetch(`/api/posts/${postId}/generate-jobs/${job.id}/tick`, {
      method: "POST",
    });
    const tickData = (await tickRes.json().catch(() => ({}))) as {
      error?: string;
      job?: ClientJob;
    };
    if (!tickRes.ok || !tickData.job) {
      throw new Error(tickData.error || "생성 진행 중 오류가 발생했습니다.");
    }
    job = tickData.job;
    onPhase?.(job);
  }

  if (job.status === "failed") {
    throw new Error(job.error || "초안 생성에 실패했습니다.");
  }

  return job;
}

export async function resumeActiveGenerationJob(
  postId: string,
  options?: { onPhase?: (job: ClientJob) => void; tickDelayMs?: number },
): Promise<ClientJob | null> {
  const res = await fetch(`/api/posts/${postId}/generate-jobs/active`);
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    job?: ClientJob | null;
  };
  if (!res.ok) throw new Error(data.error || "작업 조회 실패");
  if (!data.job) return null;

  let job = data.job;
  options?.onPhase?.(job);
  const tickDelayMs = options?.tickDelayMs ?? 350;

  while (job.status === "pending" || job.status === "running") {
    await sleep(tickDelayMs);
    const tickRes = await fetch(`/api/posts/${postId}/generate-jobs/${job.id}/tick`, {
      method: "POST",
    });
    const tickData = (await tickRes.json().catch(() => ({}))) as {
      error?: string;
      job?: ClientJob;
    };
    if (!tickRes.ok || !tickData.job) {
      throw new Error(tickData.error || "생성 진행 중 오류가 발생했습니다.");
    }
    job = tickData.job;
    options?.onPhase?.(job);
  }

  if (job.status === "failed") {
    throw new Error(job.error || "초안 생성에 실패했습니다.");
  }
  return job;
}
