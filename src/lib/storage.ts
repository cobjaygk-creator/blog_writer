import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function storageConfigured() {
  return Boolean(
    process.env.STORAGE_ENDPOINT?.trim() &&
      process.env.STORAGE_BUCKET?.trim() &&
      process.env.STORAGE_ACCESS_KEY?.trim() &&
      process.env.STORAGE_SECRET_KEY?.trim(),
  );
}

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

export async function uploadImageBuffer(input: {
  buffer: Buffer;
  contentType: string;
  folder?: string;
}): Promise<{ imageUrl: string }> {
  const ext = extensionFromMime(input.contentType);
  const key = `${input.folder || "posts"}/${randomUUID()}.${ext}`;

  if (storageConfigured()) {
    const bucket = process.env.STORAGE_BUCKET!.trim();
    const client = getS3Client();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.contentType,
      }),
    );
    const publicBase = process.env.STORAGE_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
    const endpoint = process.env.STORAGE_ENDPOINT!.trim().replace(/\/$/, "");
    const imageUrl = publicBase ? `${publicBase}/${key}` : `${endpoint}/${bucket}/${key}`;
    return { imageUrl };
  }

  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await mkdir(uploadsDir, { recursive: true });
  const filename = key.replace(/\//g, "-");
  await writeFile(path.join(uploadsDir, filename), input.buffer);
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
  return { imageUrl: `${appUrl}/uploads/${filename}` };
}
