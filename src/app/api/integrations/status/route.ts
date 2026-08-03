import { NextResponse } from "next/server";

import { getIntegrationsStatus } from "@/lib/integrations";

export async function GET() {
  return NextResponse.json({
    service: "blog_writer",
    integrations: getIntegrationsStatus(),
    time: new Date().toISOString(),
  });
}
