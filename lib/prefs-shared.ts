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

// cOver was read off a low-resolution settings screenshot (swatch pixels + blurred hex label), so it may be a shade off
export const STATE_PALETTE = { cMoving: "#22c55e", cIdle: "#f59e0b", cStopped: "#70cfff", cOver: "#f01919", cOffline: "#64748b" } as const;

export const DEFAULT_PREFS: Prefs = {
  theme: "light", nav: "end", navMode: "hover", list: "start", listMode: "hover", limit: 80, trails: true, labels: true, tile: "light", geo: "server",
  colorMode: "state", ...STATE_PALETTE, autoScale: true, iconSize: 1.4, ctl: "auto",
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
    const D = DEFAULT_PREFS;
    return {
      theme: pick(o.theme, ["dark", "light", "system"], D.theme),
      nav: pick(o.nav, ["start", "end", "top", "bottom"], D.nav),
      navMode: pick(o.navMode, ["hover", "fixed"], D.navMode),
      list: pick(o.list, ["start", "end", "bottom"], D.list),
      listMode: pick(o.listMode, ["hover", "fixed"], D.listMode),
      limit: Math.min(200, Math.max(30, Number(o.limit) || D.limit)),
      trails: typeof o.trails === "boolean" ? o.trails : D.trails,
      labels: typeof o.labels === "boolean" ? o.labels : D.labels,
      tile: pick(o.tile, ["auto", "dark", "light", "sat", "topo"], D.tile),
      geo: pick(o.geo, ["server", "osm", "off"], D.geo),
      colorMode: pick(o.colorMode, ["state", "device"], D.colorMode),
      cMoving: hex(o.cMoving, D.cMoving), cIdle: hex(o.cIdle, D.cIdle), cStopped: hex(o.cStopped, D.cStopped),
      cOver: hex(o.cOver, D.cOver), cOffline: hex(o.cOffline, D.cOffline),
      ctl: pick(o.ctl, ["auto", "pinned", "hidden"], D.ctl),
      autoScale: typeof o.autoScale === "boolean" ? o.autoScale : D.autoScale,
      iconSize: Math.min(2, Math.max(0.5, Number(o.iconSize) || D.iconSize)),
    };
  } catch { return DEFAULT_PREFS; }
}


/** Look-and-feel of the map and vehicles: kept on the server per user, so every device shows the same. Layout (nav, list, tools) stays per device. */
export const SYNCED_KEYS = ["theme", "limit", "trails", "labels", "tile", "geo", "colorMode", "cMoving", "cIdle", "cStopped", "cOver", "cOffline", "autoScale", "iconSize"] as const satisfies readonly (keyof Prefs)[];
export type SyncedPrefs = Pick<Prefs, (typeof SYNCED_KEYS)[number]>;

export const pickSynced = (p: Prefs): SyncedPrefs => Object.fromEntries(SYNCED_KEYS.map((k) => [k, p[k]])) as SyncedPrefs;
export const sameSynced = (a: Prefs, b: Prefs) => SYNCED_KEYS.every((k) => a[k] === b[k]);
