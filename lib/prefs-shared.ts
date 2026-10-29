// Shared (server + client) preference types and cookie parsing.
export interface Prefs {
  theme: "dark" | "light" | "system";
  nav: "start" | "end" | "top" | "bottom";
  navMode: "hover" | "fixed";
  list: "start" | "end" | "bottom";
  listMode: "hover" | "fixed";
  limit: number;
  trails: boolean;
  labels: boolean;
  tile: "auto" | "dark" | "light" | "sat" | "topo";
  geo: "server" | "osm" | "off";
  /** "state" = colour by live status (palette below); "device" = the colour saved on each vehicle. */
  colorMode: "state" | "device";
  cMoving: string; cIdle: string; cStopped: string; cOver: string; cOffline: string;
  /** Icons grow/shrink with the map zoom; iconSize is the user's extra multiplier. */
  autoScale: boolean;
  iconSize: number;
  /** Map tool buttons: auto = hidden until the mouse nears the edge, pinned = always shown, hidden = only a small handle. */
  ctl: "auto" | "pinned" | "hidden";
}

export const STATE_PALETTE = { cMoving: "#22c55e", cIdle: "#f59e0b", cStopped: "#ef4444", cOver: "#d946ef", cOffline: "#64748b" } as const;

export const DEFAULT_PREFS: Prefs = {
  theme: "dark", nav: "start", navMode: "hover", list: "start", listMode: "hover", limit: 100, trails: true, labels: true, tile: "auto", geo: "server",
  colorMode: "state", ...STATE_PALETTE, autoScale: true, iconSize: 1, ctl: "auto",
};

const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : d);

export function parsePrefs(raw?: string | null): Prefs {
  if (!raw) return DEFAULT_PREFS;
  try { return normalizePrefs(JSON.parse(decodeURIComponent(raw))); } catch { return DEFAULT_PREFS; }
}

/** Any object (cookie, server file, request body) -> a complete, valid Prefs; unknown or invalid fields fall back to the defaults. */
export function normalizePrefs(o: Record<string, unknown>): Prefs {
  try {
    const pick = <T extends string>(v: unknown, ok: readonly T[], d: T) => (ok.includes(v as T) ? (v as T) : d);
    return {
      theme: pick(o.theme, ["dark", "light", "system"], "dark"),
      nav: pick(o.nav, ["start", "end", "top", "bottom"], "start"),
      navMode: pick(o.navMode, ["hover", "fixed"], "hover"),
      list: pick(o.list, ["start", "end", "bottom"], "start"),
      listMode: pick(o.listMode, ["hover", "fixed"], "hover"),
      limit: Math.min(200, Math.max(30, Number(o.limit) || 100)),
      trails: o.trails !== false,
      labels: o.labels !== false,
      tile: pick(o.tile, ["auto", "dark", "light", "sat", "topo"], "auto"),
      geo: pick(o.geo, ["server", "osm", "off"], "server"),
      colorMode: pick(o.colorMode, ["state", "device"], "state"),
      cMoving: hex(o.cMoving, STATE_PALETTE.cMoving), cIdle: hex(o.cIdle, STATE_PALETTE.cIdle), cStopped: hex(o.cStopped, STATE_PALETTE.cStopped),
      cOver: hex(o.cOver, STATE_PALETTE.cOver), cOffline: hex(o.cOffline, STATE_PALETTE.cOffline),
      ctl: pick(o.ctl, ["auto", "pinned", "hidden"], "auto"),
      autoScale: o.autoScale !== false,
      iconSize: Math.min(2, Math.max(0.5, Number(o.iconSize) || 1)),
    };
  } catch { return DEFAULT_PREFS; }
}



/** Look-and-feel of the map and vehicles: kept on the server per user, so every device shows the same. Layout (nav, list, tools) stays per device. */
export const SYNCED_KEYS = ["theme", "limit", "trails", "labels", "tile", "geo", "colorMode", "cMoving", "cIdle", "cStopped", "cOver", "cOffline", "autoScale", "iconSize"] as const satisfies readonly (keyof Prefs)[];
export type SyncedPrefs = Pick<Prefs, (typeof SYNCED_KEYS)[number]>;

export const pickSynced = (p: Prefs): SyncedPrefs => Object.fromEntries(SYNCED_KEYS.map((k) => [k, p[k]])) as SyncedPrefs;
export const sameSynced = (a: Prefs, b: Prefs) => SYNCED_KEYS.every((k) => a[k] === b[k]);
