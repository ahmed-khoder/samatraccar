import "server-only";
import { cookies } from "next/headers";

export const TRACCAR_URL = (process.env.TRACCAR_URL || "https://traccar.sst-egy.co").replace(/\/$/, "");
export const TOKEN_COOKIE = "tc_token";

export async function getToken() {
  return (await cookies()).get(TOKEN_COOKIE)?.value;
}
