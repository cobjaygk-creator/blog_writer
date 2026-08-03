import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "blog_writer",
    time: new Date().toISOString(),
  });
}
