import { NextRequest, NextResponse } from "next/server";
import { traccarUrl, getToken } from "@/lib/traccar";
import { MAX_RANGE_MS, toWire, type Wire } from "@/lib/playback";

/**
 * One vehicle's route for the playback screen, in compact form (~40 bytes a point instead of ~600): GET ?deviceId=&from=&to= (ms).
 * Traccar's route report is fetched a day at a time. Before the server upgrade of 2026-10-31 some trackers stored fixes dated 8 h
 * ahead or 1024 weeks back; for windows reaching back before then, those spans are fetched too and their times put right
 * (lib/playback trueTime). `lastSeen` is the newest server receipt in the window, status packets included: proof the tracker
 * was still reporting, which bounds a stop that is still going on at the end of the window.
 */
const DAY = 864e5, H8 = 8 * 36e5, ROLLOVER = 1024 * 7 * DAY;
const FAULTS_END = Date.parse("2026-11-01T00:00:00Z");

type Stored = Parameters<typeof toWire>[0][number];

async function route(token: string, id: number, from: number, to: number): Promise<Stored[]> {
  const r = await fetch(`${traccarUrl()}/api/reports/route?deviceId=${id}&from=${new Date(from).toISOString()}&to=${new Date(to).toISOString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(45000),
  });
  if (!r.ok) throw Object.assign(new Error(`traccar ${r.status}`), { status: r.status });
  return r.json() as Promise<Stored[]>;
}

export async function GET(req: NextRequest) {
  const token = await getToken();
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = req.nextUrl.searchParams;
  const id = Number(q.get("deviceId")), from = Number(q.get("from")), to = Number(q.get("to"));
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) return NextResponse.json({ error: "bad request" }, { status: 400 });
  if (to - from > MAX_RANGE_MS + 36e5) return NextResponse.json({ error: "range" }, { status: 400 });

  // the spans to ask Traccar for (by stored fix time), one day each
  const spans: [number, number][] = [];
  const add = (a: number, b: number) => { for (let s = a; s < b; s += DAY) spans.push([s, Math.min(b, s + DAY)]); };
  const faulty = from < FAULTS_END;
  add(from, faulty ? to + H8 : to);
  if (faulty) add(from - ROLLOVER, Math.min(to, FAULTS_END) - ROLLOVER + H8);

  const rows: Stored[] = [];
  try {
    for (let k = 0; k < spans.length; k += 3) {
      const got = await Promise.all(spans.slice(k, k + 3).map(([a, b]) => route(token, id, a, b)));
      got.forEach((g) => rows.push(...g));
    }
  } catch (e) {
    const status = (e as { status?: number }).status;
    const res = NextResponse.json({ error: "upstream unavailable" }, { status: status === 401 ? 401 : 502 });
    if (status === 401) res.cookies.delete("tc_token");
    return res;
  }
  const pts: Wire[] = toWire(rows, from, to);
  let lastSeen = 0;
  for (const r of rows) { const s = Date.parse(r.serverTime); if (s <= to + 60000 && s > lastSeen) lastSeen = s; }
  return NextResponse.json({ pts, lastSeen: lastSeen || null });
}
