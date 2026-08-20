import { readFile } from "fs/promises";
import path from "path";

import {
  contentTypeForUpload,
  isSafeUploadFilename,
  localUploadsDir,
} from "@/lib/local-uploads";

type Params = { params: Promise<{ filename: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { filename } = await params;
  if (!isSafeUploadFilename(filename)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const filePath = path.join(localUploadsDir(), filename);
    const buffer = await readFile(filePath);
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentTypeForUpload(filename),
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
