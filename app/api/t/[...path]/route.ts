import { NextRequest, NextResponse } from "next/server";
import { TRACCAR_URL, getToken } from "@/lib/traccar";

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { path } = await ctx.params;
  const url = `${TRACCAR_URL}/api/${path.join("/")}${req.nextUrl.search}`;
  const hasBody = req.method !== "GET";
  const r = await fetch(url, {
    method: req.method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body: hasBody ? await req.text() : undefined,
    cache: "no-store",
  });
  const res = new NextResponse(r.body, {
    status: r.status,
    headers: { "Content-Type": r.headers.get("content-type") || "application/json" },
  });
  if (r.status === 401) res.cookies.delete("tc_token");
  return res;
}

export const GET = forward;
// POST is limited to sending device commands
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (path.join("/") !== "commands/send") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return forward(req, ctx);
}
