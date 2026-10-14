import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/traccar";
import { analyze } from "@/lib/analytics";
import type { AnalyticsResponse } from "@/lib/agg";

export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const from = Date.parse(sp.get("from") ?? ""), to = Date.parse(sp.get("to") ?? "");
  if (!(from < to)) return NextResponse.json({ error: "bad range" }, { status: 400 });
  if (to - from > 32 * 864e5) return NextResponse.json({ error: "range too large (max 31 days)" }, { status: 400 });
  const offset = Number(sp.get("offset") ?? 0) || 0;
  const limit = Number(sp.get("limit") ?? 100) || 100;
  const only = sp.get("devices")?.split(",").map(Number).filter(Boolean);
  try {
    const devices = await analyze(token, from, to, offset, limit, only);
    const body: AnalyticsResponse = { devices, limit, from: sp.get("from")!, to: sp.get("to")! };
    return NextResponse.json(body);
  } catch (e) {
    const unauthorized = e instanceof Error && e.message === "401";
    return NextResponse.json({ error: "upstream error" }, { status: unauthorized ? 401 : 502 });
  }
}
