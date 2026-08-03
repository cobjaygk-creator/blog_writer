const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const email = `e2e_${Date.now()}@example.com`;
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
  if (options.json) {
    headers.set("content-type", "application/json");
  }
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
    data = { raw: text.slice(0, 300) };
  }
  return { res, data };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log("BASE", BASE);
  console.log("email", email);

  let step = "health";
  let { res, data } = await request("/api/health");
  assert(res.ok && data?.status === "ok", `health failed: ${res.status}`);

  step = "register";
  ({ res, data } = await request("/api/auth/register", {
    method: "POST",
    json: { email, password },
  }));
  assert(res.status === 201 && data?.user?.id, `register failed: ${res.status} ${JSON.stringify(data)}`);

  step = "csrf";
  ({ res, data } = await request("/api/auth/csrf"));
  assert(res.ok && data?.csrfToken, `csrf failed: ${res.status}`);
  const csrfToken = data.csrfToken;

  step = "signin";
  const form = new URLSearchParams({
    csrfToken,
    email,
    password,
    callbackUrl: `${BASE}/dashboard`,
    json: "true",
  });
  ({ res, data } = await request("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
    redirect: "manual",
  }));
  assert(res.status === 302 || res.ok, `signin failed: ${res.status} ${JSON.stringify(data)}`);
  assert(cookieJar.has("authjs.session-token") || [...cookieJar.keys()].some((k) => k.includes("session-token")), "no session cookie after signin");

  step = "session";
  ({ res, data } = await request("/api/auth/session"));
  assert(res.ok && data?.user?.email === email, `session failed: ${JSON.stringify(data)}`);

  step = "create-brand";
  ({ res, data } = await request("/api/brands", {
    method: "POST",
    json: { name: "E2E 카페" },
  }));
  assert(res.status === 201 && data?.brand?.id, `brand failed: ${JSON.stringify(data)}`);
  const brandId = data.brand.id;

  step = "source-post";
  const rawText =
    "안녕하세요, 블루문 카페입니다. 오늘은 봄 시즌 신메뉴를 소개해요. 상큼한 유자 에이드와 함께 여유로운 오후를 보내보세요. 매장 창가 자리는 햇살이 따뜻해서 특히 인기입니다. 방문 전 예약도 가능하니 편하게 문의 주세요.";
  ({ res, data } = await request(`/api/brands/${brandId}/source-posts`, {
    method: "POST",
    json: { rawText },
  }));
  assert(res.status === 201 && data?.sourcePost?.id, `source failed: ${JSON.stringify(data)}`);

  step = "style-learn";
  ({ res, data } = await request(`/api/brands/${brandId}/style/learn`, { method: "POST" }));
  assert(res.ok && data?.styleProfile?.summaryText, `learn failed: ${JSON.stringify(data)}`);
  console.log("style version", data.styleProfile.version);

  step = "create-post";
  ({ res, data } = await request("/api/posts", {
    method: "POST",
    json: { brandId, keyword: "봄 시즌 신메뉴" },
  }));
  assert(res.status === 201 && data?.post?.id, `post failed: ${JSON.stringify(data)}`);
  const postId = data.post.id;

  step = "upload-image";
  // 1x1 PNG
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5WlL8AAAAASUVORK5CYII=",
    "base64",
  );
  const blob = new Blob([png], { type: "image/png" });
  const fd = new FormData();
  fd.append("file", blob, "dot.png");
  fd.append("autoCaption", "true");
  ({ res, data } = await request(`/api/posts/${postId}/images`, {
    method: "POST",
    body: fd,
  }));
  assert(res.status === 201 && data?.image?.id, `upload failed: ${JSON.stringify(data)}`);
  console.log("caption", data.image.caption);

  step = "generate";
  ({ res, data } = await request(`/api/posts/${postId}/generate`, {
    method: "POST",
    json: { keyword: "봄 시즌 신메뉴" },
  }));
  assert(res.ok && data?.post?.status === "draft" && data.post.body, `generate failed: ${JSON.stringify(data)}`);
  console.log("title", data.post.title);
  console.log("bodyChars", data.post.body.length);

  step = "get-post";
  ({ res, data } = await request(`/api/posts/${postId}`));
  assert(res.ok && data?.post?.images?.length === 1, `get post failed: ${JSON.stringify(data)}`);
  const imageId = data.post.images[0].id;

  step = "reorder";
  ({ res, data } = await request(`/api/posts/${postId}/images/reorder`, {
    method: "PATCH",
    json: { orderedIds: [imageId] },
  }));
  assert(res.ok && data?.images?.length === 1, `reorder failed: ${JSON.stringify(data)}`);

  console.log("E2E_OK", { email, brandId, postId, imageId });
}

main().catch((err) => {
  console.error("E2E_FAIL", err.message);
  process.exit(1);
});
