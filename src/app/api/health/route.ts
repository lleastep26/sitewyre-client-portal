import { NextResponse } from "next/server";
import { buildHealthChecks } from "@/lib/health/checks";

export async function GET() {
  const checks = buildHealthChecks();
  return NextResponse.json({
    ok: true,
    service: "sitewyre-client-portal",
    time: new Date().toISOString(),
    checks,
  });
}
