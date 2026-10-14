import { NextResponse } from "next/server";
import { TRACCAR_URL, TOKEN_COOKIE } from "@/lib/traccar";

export async function POST(req: Request) {
  const { email, password } = await req.json();
  const r = await fetch(`${TRACCAR_URL}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ email, password }),
  });
  if (!r.ok) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  const user = await r.json();
  const session = (r.headers.get("set-cookie") || "").split(";")[0];

  const days = 30;
  const t = await fetch(`${TRACCAR_URL}/api/session/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: session },
    body: new URLSearchParams({ expiration: new Date(Date.now() + days * 864e5).toISOString() }),
  });
  if (!t.ok) return NextResponse.json({ error: "Could not create access token" }, { status: 502 });
  const token = await t.text();

  const res = NextResponse.json({ user });
  res.cookies.set(TOKEN_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: days * 86400,
  });
  return res;
}
