function getVisionConfig() {
  return {
    apiKey: process.env.VISION_API_KEY?.trim() || process.env.LLM_API_KEY?.trim() || "",
    baseUrl: (
      process.env.VISION_BASE_URL?.trim() ||
      process.env.LLM_BASE_URL?.trim() ||
      "https://api.openai.com/v1"
    ).replace(/\/$/, ""),
    model: process.env.VISION_MODEL?.trim() || process.env.LLM_MODEL?.trim() || "gpt-4o-mini",
  };
}

export async function captionImage(imageUrl: string, keyword?: string | null): Promise<string> {
  const { apiKey, baseUrl, model } = getVisionConfig();

  if (!apiKey) {
    return fallbackCaption(imageUrl, keyword);
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "당신은 블로그용 한국어 이미지 캡션 작가입니다. 1~2문장으로 장면·분위기·맥락을 설명하세요. 따옴표 없이 본문만 출력하세요.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: keyword
                ? `키워드 "${keyword}"와 연결해 이 사진을 설명하세요.`
                : "이 사진을 블로그용으로 설명하세요.",
            },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Vision 요청 실패 (${response.status}): ${detail.slice(0, 200)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content?.trim();
  return text || fallbackCaption(imageUrl, keyword);
}

function fallbackCaption(imageUrl: string, keyword?: string | null) {
  const file = imageUrl.split("/").pop()?.split("?")[0] || "image";
  if (keyword) {
    return `${keyword} 장면 — ${file} (로컬 캡션, VISION_API_KEY 미설정)`;
  }
  return `업로드된 사진 ${file}의 장면입니다. (로컬 캡션, VISION_API_KEY 미설정)`;
}
