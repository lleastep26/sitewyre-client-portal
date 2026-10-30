import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "sitewyre-client-portal",
    time: new Date().toISOString(),
  });
}
