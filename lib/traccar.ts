import "server-only";
import { cookies } from "next/headers";

/** Traccar server base URL — set TRACCAR_URL in .env (read at request time so one image works for any server). */
export function traccarUrl() {
  const u = process.env.TRACCAR_URL;
  if (!u) throw new Error("TRACCAR_URL is not set. Copy .env.example to .env and set your Traccar server URL.");
  return u.replace(/\/$/, "");
}

export const TOKEN_COOKIE = "tc_token";

/**
 * Cookie `secure` flag. Auto-detected from the request: HTTPS (directly, or via a reverse proxy that sends
 * X-Forwarded-Proto: https, like Nginx Proxy Manager) => secure; plain HTTP => not secure, otherwise the browser
 * would silently drop the cookie and login would loop. COOKIE_SECURE=true|false overrides the detection.
 */
export function cookieSecure(req?: Request) {
  const o = process.env.COOKIE_SECURE;
  if (o === "true" || o === "false") return o === "true";
  const proto = req?.headers.get("x-forwarded-proto")?.split(",")[0].trim() || (req ? new URL(req.url).protocol.replace(":", "") : "");
  return proto === "https";
}

export async function getToken() {
  return (await cookies()).get(TOKEN_COOKIE)?.value;
}
