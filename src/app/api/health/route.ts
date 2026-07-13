import { NextResponse } from "next/server";
import { getSiteData } from "@/lib/store";

export const dynamic = "force-dynamic";

// Diagnostic endpoint: reports which persistence backend is active and whether
// a read actually works. Reports env-var *presence* only (never values).
export async function GET() {
  const detected = {
    KV_REST_API_URL: Boolean(process.env.KV_REST_API_URL),
    KV_REST_API_TOKEN: Boolean(process.env.KV_REST_API_TOKEN),
    UPSTASH_REDIS_REST_URL: Boolean(process.env.UPSTASH_REDIS_REST_URL),
    UPSTASH_REDIS_REST_TOKEN: Boolean(process.env.UPSTASH_REDIS_REST_TOKEN),
  };
  const usingRedis =
    (detected.KV_REST_API_URL && detected.KV_REST_API_TOKEN) ||
    (detected.UPSTASH_REDIS_REST_URL && detected.UPSTASH_REDIS_REST_TOKEN);

  let readOk: boolean | null = null;
  let readError: string | null = null;
  let propertyCount: number | null = null;
  try {
    const data = await getSiteData();
    readOk = true;
    propertyCount = data.properties.length;
  } catch (e) {
    readOk = false;
    readError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    persistence: usingRedis ? "redis" : "file",
    envDetected: detected,
    readOk,
    readError,
    propertyCount,
  });
}
