import { NextRequest, NextResponse } from "next/server";
import { traccarUrl, getToken } from "@/lib/traccar";

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { path } = await ctx.params;
  const url = `${traccarUrl()}/api/${path.join("/")}${req.nextUrl.search}`;
  const hasBody = req.method !== "GET";
  let r: Response;
  try {
    r = await fetch(url, {
    method: req.method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
    },
    body: hasBody ? await req.text() : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(30000),
    });
  } catch {
    return NextResponse.json({ error: "upstream unavailable" }, { status: 502 });
  }
  const res = new NextResponse(r.body, {
    status: r.status,
    headers: { "Content-Type": r.headers.get("content-type") || "application/json" },
  });
  if (r.status === 401) res.cookies.delete("tc_token");
  return res;
}

export const GET = forward;
// Writes are limited to: sending commands, and editing a device (name / category / colour).
export async function POST(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (path.join("/") !== "commands/send") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return forward(req, ctx);
}
export async function PUT(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  if (!(path.length === 2 && path[0] === "devices" && /^\d+$/.test(path[1]))) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return forward(req, ctx);
}
