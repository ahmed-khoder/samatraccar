import { NextResponse } from "next/server";
import { traccarUrl, getToken } from "@/lib/traccar";
import { isAhead, newestSane } from "@/lib/live-merge";
import type { Device, Position } from "@/lib/types";

/**
 * Latest position per device, like Traccar's /api/positions, with one correction.
 *
 * Traccar only replaces a device's "latest" position when the new fix is not older than the current one (PositionUtil.isLatest).
 * GT06 trackers left on their factory UTC+8 clock stored fixes dated 8 h in the future. Once a tracker's clock is corrected
 * (device attributes decoder.timezone + tracarTzSince), its real new fixes are "older" than that future one, so for up to 8 h Traccar keeps
 * serving the stuck position — and its status packets keep re-copying it. For those devices only, we return the newest
 * stored position with a sane time instead. Nothing is invented: the result is always a position Traccar stored.
 */
const SPAN_MS = 9 * 36e5, AHEAD_MS = 2 * 60000;
const FOUND_TTL = 3000, EMPTY_TTL = 15000;
const sane = new Map<string, { at: number; p: Position | null }>(); // `${token}|${deviceId}` -> newest sane position

async function tc<T>(token: string, path: string): Promise<T> {
  const r = await fetch(`${traccarUrl()}/api/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw Object.assign(new Error(`traccar ${r.status}`), { status: r.status });
  return r.json() as Promise<T>;
}

async function saneFor(token: string, deviceId: number, since: number, now: number) {
  const key = `${token}|${deviceId}`, hit = sane.get(key);
  if (hit && now - hit.at < (hit.p ? FOUND_TTL : EMPTY_TTL)) return hit.p;
  // after the first hit only ask for what came since (fixes are filtered by their — now correct — fix time)
  const from = hit?.p ? Date.parse(hit.p.fixTime) - 60000 : Math.max(now - SPAN_MS, since - 60000);
  let p = hit?.p ?? null;
  try {
    p = newestSane(await tc<Position[]>(token, `positions?deviceId=${deviceId}&from=${new Date(from).toISOString()}&to=${new Date(now + AHEAD_MS).toISOString()}`), p, since);
  } catch {}
  sane.set(key, { at: now, p });
  return p;
}

export async function GET() {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let latest: Position[], devices: Device[];
  try {
    [latest, devices] = await Promise.all([tc<Position[]>(token, "positions"), tc<Device[]>(token, "devices")]);
  } catch (e) {
    const status = (e as { status?: number }).status;
    const res = NextResponse.json({ error: "upstream unavailable" }, { status: status === 401 ? 401 : 502 });
    if (status === 401) res.cookies.delete("tc_token");
    return res;
  }
  const now = Date.now();
  // when each tracker's clock was corrected (set together with decoder.timezone by the fix script)
  const since = new Map(devices.filter((d) => d.attributes?.["decoder.timezone"] && d.attributes?.tracarTzSince)
    .map((d) => [d.id, Date.parse(String(d.attributes.tracarTzSince))]));
  const out = await Promise.all(latest.map(async (p) => {
    const s = since.get(p.deviceId);
    if (!isAhead(p) || !s) return p; // no corrected data can exist for it
    return (await saneFor(token, p.deviceId, s, now)) ?? p;
  }));
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
