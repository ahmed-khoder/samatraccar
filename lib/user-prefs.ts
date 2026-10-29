import "server-only";
import fs from "node:fs";
import path from "node:path";
import { traccarUrl } from "./traccar";
import { normalizePrefs, pickSynced, type SyncedPrefs } from "./prefs-shared";

// Per-user map/vehicle appearance, stored next to the analytics cache so it survives restarts (CACHE_DIR in Docker = /data).
const FILE = path.join(process.env.CACHE_DIR || path.join(process.cwd(), ".cache"), "user-prefs.json");
const ids = new Map<string, number>(); // token -> Traccar user id

/** The Traccar user behind an access token (null when the token is no longer valid). */
export async function userIdFor(token: string): Promise<number | null> {
  const hit = ids.get(token);
  if (hit) return hit;
  try {
    const r = await fetch(`${traccarUrl()}/api/session?token=${encodeURIComponent(token)}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    const u = (await r.json()) as { id?: number };
    if (!u.id) return null;
    ids.set(token, u.id);
    return u.id;
  } catch { return null; }
}

function readAll(): Record<string, SyncedPrefs> {
  try { return JSON.parse(fs.readFileSync(FILE, "utf8")); } catch { return {}; }
}

export const getUserPrefs = (userId: number): SyncedPrefs | null => readAll()[userId] ?? null;

export function setUserPrefs(userId: number, body: Record<string, unknown>) {
  const all = readAll();
  all[userId] = pickSynced(normalizePrefs(body)); // validated, and only the synced fields are kept
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(all));
  fs.renameSync(tmp, FILE); // atomic: a crash never leaves a half-written file
  return all[userId];
}
