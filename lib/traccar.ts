import "server-only";
import { cookies } from "next/headers";

/** Traccar server base URL — set TRACCAR_URL in .env (read at request time so one image works for any server). */
export function traccarUrl() {
  const u = process.env.TRACCAR_URL;
  if (!u) throw new Error("TRACCAR_URL is not set. Copy .env.example to .env and set your Traccar server URL.");
  return u.replace(/\/$/, "");
}

export const TOKEN_COOKIE = "tc_token";

/** Cookie `secure` flag: on in production unless COOKIE_SECURE=false (needed when reaching the app over plain http, e.g. http://ip:3000). */
export const cookieSecure = () => (process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production");

export async function getToken() {
  return (await cookies()).get(TOKEN_COOKIE)?.value;
}
