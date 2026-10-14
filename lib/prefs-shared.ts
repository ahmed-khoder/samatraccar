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
}

export const DEFAULT_PREFS: Prefs = {
  theme: "dark", nav: "start", navMode: "hover", list: "start", listMode: "hover", limit: 100, trails: true, labels: true, tile: "auto", geo: "server",
};

export function parsePrefs(raw?: string | null): Prefs {
  if (!raw) return DEFAULT_PREFS;
  try {
    const o = JSON.parse(decodeURIComponent(raw));
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
    };
  } catch { return DEFAULT_PREFS; }
}

