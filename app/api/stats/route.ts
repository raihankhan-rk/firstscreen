import { NextResponse } from "next/server";
import { getStats } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getStats());
  } catch {
    return NextResponse.json(
      { error: "Stats are temporarily unavailable." },
      { status: 503 },
    );
  }
}
