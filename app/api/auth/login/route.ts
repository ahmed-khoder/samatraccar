import { NextResponse } from "next/server";
import { traccarUrl, cookieSecure, TOKEN_COOKIE } from "@/lib/traccar";

export async function POST(req: Request) {
  const { email, password } = await req.json();
  const r = await fetch(`${traccarUrl()}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ email, password }),
  });
  if (!r.ok) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  const user = await r.json();
  const session = (r.headers.get("set-cookie") || "").split(";")[0];

  const days = 30;
  const t = await fetch(`${traccarUrl()}/api/session/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: session },
    body: new URLSearchParams({ expiration: new Date(Date.now() + days * 864e5).toISOString() }),
  });
  if (!t.ok) return NextResponse.json({ error: "Could not create access token" }, { status: 502 });
  const token = await t.text();

  const res = NextResponse.json({ user });
  res.cookies.set(TOKEN_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: cookieSecure(req),
    path: "/", maxAge: days * 86400,
  });
  return res;
}
