import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import {
  allowFallback,
  assertAllowedImage,
  isStorageConfigured,
  storageTimeoutMs,
  uploadMaxBytes,
} from "@/lib/integrations";
import { localUploadsDir } from "@/lib/local-uploads";

function getS3Client() {
  return new S3Client({
    region: process.env.STORAGE_REGION?.trim() || "ap-northeast-2",
    endpoint: process.env.STORAGE_ENDPOINT?.trim(),
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.STORAGE_ACCESS_KEY!.trim(),
      secretAccessKey: process.env.STORAGE_SECRET_KEY!.trim(),
    },
  });
}

function extensionFromMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} 시간 초과 (${timeoutMs}ms)`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export type UploadResult = {
  imageUrl: string;
  contentType: string;
  provider: "s3" | "local";
  usedFallback: boolean;
};

export async function uploadImageBuffer(input: {
  buffer: Buffer;
  contentType: string;
  folder?: string;
}): Promise<UploadResult> {
  if (input.buffer.byteLength > uploadMaxBytes()) {
    throw new Error(`파일 크기는 ${Math.floor(uploadMaxBytes() / (1024 * 1024))}MB 이하여야 합니다.`);
  }

  const detected = assertAllowedImage(input.buffer, input.contentType);
  const ext = extensionFromMime(detected);
  const key = `${input.folder || "posts"}/${randomUUID()}.${ext}`;

  if (isStorageConfigured()) {
    try {
      const bucket = process.env.STORAGE_BUCKET!.trim();
      const client = getS3Client();
      await withTimeout(
        client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: input.buffer,
            ContentType: detected,
            ContentLength: input.buffer.byteLength,
          }),
        ),
        storageTimeoutMs(),
        "S3 업로드",
      );
      const publicBase = process.env.STORAGE_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
      const endpoint = process.env.STORAGE_ENDPOINT!.trim().replace(/\/$/, "");
      const imageUrl = publicBase ? `${publicBase}/${key}` : `${endpoint}/${bucket}/${key}`;
      return {
        imageUrl,
        contentType: detected,
        provider: "s3",
        usedFallback: false,
      };
    } catch (error) {
      if (!allowFallback()) {
        throw error instanceof Error ? error : new Error("S3 업로드에 실패했습니다.");
      }
      console.warn("[storage] S3 failed, using local fallback:", error);
      return uploadLocally({ buffer: input.buffer, contentType: detected, key, usedFallback: true });
    }
  }

  // S3 not configured → local disk is the primary storage mode for local/dev.
  return uploadLocally({ buffer: input.buffer, contentType: detected, key, usedFallback: false });
}

async function uploadLocally(input: {
  buffer: Buffer;
  contentType: string;
  key: string;
  usedFallback: boolean;
}): Promise<UploadResult> {
  const uploadsDir = localUploadsDir();
  await mkdir(uploadsDir, { recursive: true });
  const filename = input.key.replace(/\//g, "-");
  await writeFile(path.join(uploadsDir, filename), input.buffer);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return {
    // Serve via API so Next standalone can return runtime-written files.
    imageUrl: `${appUrl}/api/uploads/${filename}`,
    contentType: input.contentType,
    provider: "local",
    usedFallback: input.usedFallback,
  };
}
