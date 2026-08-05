/**
 * Smoke: worklog / product / topic + publish URL + post-draft image keep.
 * Usage: node scripts/smoke-phase-improvements.mjs
 */
const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const email = `smoke_${Date.now()}@example.com`;
const password = "password123";
const cookieJar = new Map();

function storeCookies(res) {
  const raw = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const line of raw) {
    const [pair] = line.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) cookieJar.set(pair.slice(0, idx), pair.slice(idx + 1));
  }
}

function cookieHeader() {
  return [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const cookies = cookieHeader();
  if (cookies) headers.set("cookie", cookies);
  if (options.json) headers.set("content-type", "application/json");
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers,
    body: options.json ? JSON.stringify(options.json) : options.body,
  });
  storeCookies(res);
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 400) };
  }
  return { res, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function runJob(postId, body) {
  let { res, data } = await request(`/api/posts/${postId}/generate-jobs`, {
    method: "POST",
    json: body,
  });
  assert(res.status === 202 && data?.job?.id, `create job failed: ${res.status} ${JSON.stringify(data)}`);
  let job = data.job;
  for (let i = 0; i < 80 && (job.status === "pending" || job.status === "running"); i++) {
    await new Promise((r) => setTimeout(r, 800));
    ({ res, data } = await request(`/api/posts/${postId}/generate-jobs/${job.id}/tick`, {
      method: "POST",
    }));
    assert(res.ok && data?.job, `tick failed: ${res.status} ${JSON.stringify(data)}`);
    job = data.job;
    process.stdout.write(`  [${body.kind}] phase=${job.phase} status=${job.status}\n`);
  }
  return job;
}

async function main() {
  console.log("BASE", BASE, "email", email);

  let { res, data } = await request("/api/health");
  assert(res.ok, `health ${res.status}`);

  ({ res, data } = await request("/api/auth/register", {
    method: "POST",
    json: { email, password },
  }));
  assert(res.status === 201, `register ${res.status}`);

  ({ res, data } = await request("/api/auth/csrf"));
  const csrfToken = data.csrfToken;
  const form = new URLSearchParams({
    csrfToken,
    email,
    password,
    callbackUrl: `${BASE}/dashboard`,
    json: "true",
  });
  ({ res } = await request("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    redirect: "manual",
  }));
  assert(res.status === 302 || res.ok, `signin ${res.status}`);

  ({ res, data } = await request("/api/brands", {
    method: "POST",
    json: { name: "스모크 테마" },
  }));
  assert(res.status === 201, `brand ${JSON.stringify(data)}`);
  const brandId = data.brand.id;

  const rawText = [
    "안녕하세요. 오늘은 사이드스텝 시공 후기를 자세히 남깁니다.",
    "장착 전후 차이가 분명하고 하체 라인이 한결 살아났어요.",
    "볼트 토크와 방청 처리까지 꼼꼼히 진행했고, 휠하우스 간섭도 체크했습니다.",
    "시공 중간중간 사진으로 과정을 남기니 고객 설명도 수월했습니다.",
    "마무리 후 세차와 실리콘 마감까지 하고 인수인계했습니다.",
    "비슷한 차종을 고민 중이시라면 실측과 브라켓 위치를 꼭 확인하세요.",
  ].join(" ");
  ({ res, data } = await request(`/api/brands/${brandId}/source-posts`, {
    method: "POST",
    json: { rawText },
  }));
  assert(res.status === 201, `source ${JSON.stringify(data)}`);

  ({ res, data } = await request(`/api/brands/${brandId}/style/learn`, { method: "POST" }));
  assert(res.ok, `learn ${JSON.stringify(data)}`);

  // --- worklog ---
  console.log("\n== worklog ==");
  ({ res, data } = await request("/api/posts", {
    method: "POST",
    json: { brandId, keyword: "사이드스텝 시공", mode: "worklog" },
  }));
  assert(res.status === 201, `worklog post ${JSON.stringify(data)}`);
  const worklogId = data.post.id;

  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );
  // 1x1 may fail vision — use solid via FormData from existing e2e helper pattern: skip vision detail
  const fd = new FormData();
  fd.append("file", new Blob([png], { type: "image/png" }), "dot.png");
  fd.append("autoCaption", "false");
  ({ res, data } = await request(`/api/posts/${worklogId}/images`, { method: "POST", body: fd }));
  assert(res.status === 201, `worklog upload ${JSON.stringify(data)}`);

  ({ res, data } = await request(`/api/posts/${worklogId}/images/fill-captions`, {
    method: "POST",
  }));
  assert(res.ok, `fill-captions ${JSON.stringify(data)}`);
  console.log("fill-captions filled=", data.filled);

  let job = await runJob(worklogId, {
    kind: "generate",
    keyword: "사이드스텝 시공",
    length: "short",
  });
  assert(job.status === "completed", `worklog job failed: ${job.error || job.status}`);
  assert(job.result?.meta?.style || job.result?.drafts?.length, "worklog missing style/drafts");
  console.log("worklog style", JSON.stringify(job.result?.meta?.style)?.slice(0, 200));

  ({ res, data } = await request(`/api/posts/${worklogId}`));
  const bodyBefore = data.post.body;
  assert(data.post.status === "draft" && bodyBefore, "worklog not draft");

  // image after draft — status should stay draft
  const fd2 = new FormData();
  fd2.append("file", new Blob([png], { type: "image/png" }), "dot2.png");
  fd2.append("autoCaption", "false");
  ({ res, data } = await request(`/api/posts/${worklogId}/images`, { method: "POST", body: fd2 }));
  assert(res.status === 201, `post-draft upload ${JSON.stringify(data)}`);
  ({ res, data } = await request(`/api/posts/${worklogId}`));
  assert(data.post.status === "draft", `expected draft after image, got ${data.post.status}`);
  assert(data.post.body === bodyBefore, "body wiped after image upload");
  console.log("worklog collecting UX OK (status=draft, body kept)");

  // publish URL archive
  ({ res, data } = await request(`/api/posts/${worklogId}`, {
    method: "PATCH",
    json: {
      status: "published",
      publishedUrl: "https://blog.naver.com/smoke/1",
      publishPlatform: "naver",
    },
  }));
  assert(res.ok && data.post.status === "published", `publish ${JSON.stringify(data)}`);
  assert(data.post.publishedUrl?.includes("blog.naver.com"), "publishedUrl missing");
  console.log("publish URL OK");

  // --- product ---
  console.log("\n== product ==");
  ({ res, data } = await request("/api/posts", {
    method: "POST",
    json: {
      brandId,
      keyword: "카니발 사이드스텝",
      mode: "product",
      productHighlights: "알루미늄 바디\n볼트온 장착\n방청 코팅",
    },
  }));
  assert(res.status === 201, `product post ${JSON.stringify(data)}`);
  const productId = data.post.id;
  job = await runJob(productId, {
    kind: "generate",
    keyword: "카니발 사이드스텝",
    productHighlights: "알루미늄 바디\n볼트온 장착\n방청 코팅",
    length: "short",
  });
  assert(job.status === "completed", `product job failed: ${job.error || job.status}`);
  console.log("product drafts", job.result?.drafts?.length, "failed", job.result?.meta?.failed);

  // --- topic ---
  console.log("\n== topic ==");
  ({ res, data } = await request("/api/posts", {
    method: "POST",
    json: { brandId, keyword: "사이드스텝 관리 팁", mode: "topic" },
  }));
  assert(res.status === 201, `topic post ${JSON.stringify(data)}`);
  const topicId = data.post.id;
  job = await runJob(topicId, {
    kind: "generate_topic",
    topic: "사이드스텝 관리 팁",
    length: "short",
    imageCount: 2,
    imageSource: "unsplash",
    replaceImages: true,
  });
  assert(job.status === "completed", `topic job failed: ${job.error || job.status}`);
  assert(job.result?.meta?.seo || job.result?.meta?.style, "topic missing seo/style meta");
  console.log("topic seo", JSON.stringify(job.result?.meta?.seo)?.slice(0, 240));
  console.log("topic style", JSON.stringify(job.result?.meta?.style)?.slice(0, 200));

  console.log("\nSMOKE_OK", { email, brandId, worklogId, productId, topicId });
}

main().catch((e) => {
  console.error("SMOKE_FAIL", e.message);
  process.exit(1);
});
