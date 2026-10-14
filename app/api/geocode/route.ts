import fs from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { getToken } from "@/lib/traccar";

// Reverse geocoding through OpenStreetMap Nominatim. Opt-in from Settings (it sends stop coordinates to a public service).
// Usage policy: max 1 request/second, identify the app, cache results — all enforced here.
const FILE = path.join(process.env.CACHE_DIR || path.join(process.cwd(), ".cache"), "geocode.json");
let cache: Map<string, string> | null = null;
let chain: Promise<unknown> = Promise.resolve();
let dirty = 0;

function load() {
  if (cache) return cache;
  cache = new Map();
  try { for (const [k, v] of Object.entries(JSON.parse(fs.readFileSync(FILE, "utf8")))) cache.set(k, String(v)); } catch {}
  return cache;
}
function save() {
  try { fs.mkdirSync(path.dirname(FILE), { recursive: true }); fs.writeFileSync(FILE, JSON.stringify(Object.fromEntries(cache ?? []))); } catch {}
}

async function lookup(lat: string, lon: string, lang: string): Promise<string> {
  const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&addressdetails=1&lat=${lat}&lon=${lon}&accept-language=${lang}`, {
    headers: { "User-Agent": "Tracar-fleet-dashboard/1.0", Accept: "application/json" }, signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(String(r.status));
  const j = await r.json();
  const a = j.address ?? {};
  const parts = [a.road ?? a.pedestrian ?? a.industrial, a.neighbourhood ?? a.suburb ?? a.quarter, a.city ?? a.town ?? a.village ?? a.county ?? a.state].filter(Boolean);
  return (parts.length ? parts : String(j.display_name ?? "").split(",").slice(0, 3)).join(lang === "ar" ? "، " : ", ");
}

export async function GET(req: NextRequest) {
  if (!(await getToken())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const lat = Number(sp.get("lat")), lon = Number(sp.get("lon"));
  const lang = sp.get("lang") === "en" ? "en" : "ar";
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return NextResponse.json({ error: "bad coords" }, { status: 400 });
  const rl = lat.toFixed(3), ro = lon.toFixed(3); // ~100 m cells: depots and repeated stops share one lookup
  const key = `${lang}|${rl}|${ro}`;
  const c = load();
  if (c.has(key)) return new NextResponse(c.get(key), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, max-age=86400" } });

  const job = chain.then(async () => {
    if (c.has(key)) return c.get(key)!;
    try {
      const v = await lookup(rl, ro, lang);
      c.set(key, v);
      if (++dirty % 5 === 0) save();
      return v;
    } finally { await new Promise((r) => setTimeout(r, 1100)); }
  });
  chain = job.catch(() => undefined);
  try {
    const v = await job;
    return new NextResponse(v, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, max-age=86400" } });
  } catch {
    return new NextResponse("", { status: 204 });
  }
}
