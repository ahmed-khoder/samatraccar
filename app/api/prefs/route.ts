import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/traccar";
import { getUserPrefs, setUserPrefs, userIdFor } from "@/lib/user-prefs";

async function who() {
  const token = await getToken();
  return token ? userIdFor(token) : null;
}

export async function GET() {
  const id = await who();
  if (!id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ prefs: getUserPrefs(id) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: NextRequest) {
  const id = await who();
  if (!id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const text = await req.text();
  if (text.length > 4096) return NextResponse.json({ error: "too large" }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(text); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "bad body" }, { status: 400 });
  return NextResponse.json({ prefs: setUserPrefs(id, body as Record<string, unknown>) });
}
