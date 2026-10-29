"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import L from "leaflet";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Device, Geofence, Position } from "@/lib/types";
import { knToKmh, speedColor, type VisualState } from "@/lib/format";
import { deviceColor, iconSvg, TOP_VIEW } from "@/lib/vehicle";
import { vehState } from "@/lib/vstate";
import { useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { Layers, Crosshair, Flame, Hexagon, Route as RouteIcon, Tag, Maximize2, Palette, Pin, PinOff, EyeOff, SlidersHorizontal } from "lucide-react";

// Every source below works without an API key. OpenFreeMap (vector, OpenStreetMap data) has no limits or registration; Esri imagery is a public tile endpoint.
const OFM = "https://tiles.openfreemap.org/styles";
const OFM_ATTR = '© <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a> Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';
type TileDef =
  | { key: "map.dark" | "map.light" | "map.topo" | "map.sat"; kind: "vector"; style: string; hybrid?: boolean; attr: string; maxZoom: number }
  | { key: "map.dark" | "map.light" | "map.topo" | "map.sat"; kind: "raster"; url: string; attr: string; sub: string; maxZoom: number };
// maxZoom = how far the map may zoom for that style: past the provider's real imagery you only get "Map data not yet available" tiles.
const TILES: Record<string, TileDef> = {
  dark: { key: "map.dark", kind: "vector", style: "dark", attr: OFM_ATTR, maxZoom: 20 },
  light: { key: "map.light", kind: "vector", style: "liberty", attr: OFM_ATTR, maxZoom: 20 },
  // satellite imagery with OpenStreetMap roads + city / road names (Latin + Arabic) drawn on top
  sat: { key: "map.sat", kind: "vector", style: "liberty", hybrid: true, attr: `Imagery © Esri, Maxar, Earthstar Geographics · ${OFM_ATTR}`, maxZoom: 19 },
  topo: { key: "map.topo", kind: "raster", url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attr: "© OpenTopoMap (CC-BY-SA)", sub: "abc", maxZoom: 17 },
};

// the maplibre-leaflet plugin defers work (rAF / moveend) that can fire after the layer or map was removed, when `_map` is already null
const GL_HANDLERS = ["_update", "_pinchZoom", "_animateZoom", "_zoomStart", "_zoomEnd", "_transitionEnd", "_resize"] as const;
function guardGlLayer<T extends object>(layer: T): T {
  const l = layer as unknown as Record<string, (...a: unknown[]) => unknown> & { _map?: unknown };
  for (const k of GL_HANDLERS) {
    const orig = l[k];
    if (typeof orig !== "function") continue;
    l[k] = function (this: typeof l, ...a: unknown[]) {
      if (!this._map) return undefined;
      if (k !== "_transitionEnd") return orig.apply(this, a);
      // _transitionEnd schedules its real work in a requestAnimationFrame: re-check the map there (it may be removed by then)
      const raf = L.Util.requestAnimFrame;
      L.Util.requestAnimFrame = ((fn: () => void, ctx?: unknown, immediate?: boolean) => raf(() => { if ((ctx as typeof l | undefined)?._map) fn.call(ctx); }, undefined, immediate)) as typeof raf;
      try { return orig.apply(this, a); } finally { L.Util.requestAnimFrame = raf; }
    };
  }
  return layer;
}

let rtlReady: Promise<void> | null = null;
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services";
const RASTER_FALLBACK = {
  dark: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`,
  light: `${ESRI}/World_Street_Map/MapServer/tile/{z}/{y}/{x}`,
  sat: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
} as const;
const hasWebGL = () => { try { const c = document.createElement("canvas"); return !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { return false; } };

/** Liberty style with its land/water fills replaced by satellite imagery; only roads and labels are kept on top. */
async function hybridStyle(): Promise<object> {
  const style = await (await fetch(`${OFM}/liberty`)).json();
  const roadLine = (id: string) => /^(road|bridge|tunnel)_/.test(id) && !/casing|rail|hatching|path|arrow|shield/.test(id);
  const layers = (style.layers as Record<string, any>[]) // eslint-disable-line @typescript-eslint/no-explicit-any
    .filter((l) => (l.type === "line" && roadLine(l.id)) || (l.type === "symbol" && !l.id.startsWith("poi")))
    .map((l) => l.type === "symbol"
      ? { ...l, paint: { ...l.paint, "text-color": "#ffffff", "text-halo-color": "rgba(0,0,0,.85)", "text-halo-width": 1.6 } }
      : { ...l, paint: { ...l.paint, "line-opacity": 0.55 } });
  return {
    ...style,
    sources: { ...style.sources, esri: { type: "raster", tileSize: 256, maxzoom: 18, tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"] } },
    layers: [{ id: "satellite", type: "raster", source: "esri" }, ...layers],
  };
}

// phones / tablets report a synthetic "mouse" now and then; only a device that really hovers may open things on pointer-enter
const canHover = () => window.matchMedia("(hover: hover)").matches;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const lerpAngle = (a: number, b: number, t: number) => {
  const d = ((((b - a) % 360) + 540) % 360) - 180;
  return a + d * t;
};
const bearing = (a: [number, number], b: [number, number]) => {
  const r = Math.PI / 180, y = Math.sin((b[1] - a[1]) * r) * Math.cos(b[0] * r);
  const x = Math.cos(a[0] * r) * Math.sin(b[0] * r) - Math.sin(a[0] * r) * Math.cos(b[0] * r) * Math.cos((b[1] - a[1]) * r);
  return ((Math.atan2(y, x) / r) + 360) % 360;
};

function vehicleHtml(o: { cat?: string | null; color: string; state: string; selected: boolean; label: string; showLabel: boolean; course: number }) {
  const top = o.cat ? TOP_VIEW[o.cat] : undefined;
  const half = top ? Math.round(top.h / 2) : 22;
  const lbl = o.showLabel ? `<div class="lbl">${esc(o.label)}</div>` : "";
  if (top) {
    return `<div class="vw" style="--half:${half}px;--k:var(--s)"><div class="veh top ${o.state} ${o.selected ? "sel" : ""}" style="--c:${o.color}">
      ${o.selected ? '<div class="ring"></div>' : ""}
      <div class="heading" style="transform:rotate(${o.course}deg)"><div class="shape" style="width:${top.w}px;height:${top.h}px;margin:${-top.h / 2}px 0 0 ${-top.w / 2}px">${top.svg(o.color)}</div></div>
    </div>${lbl}</div>`;
  }
  return `<div class="vw" style="--half:${half}px;--k:var(--sb)"><div class="veh ${o.state} ${o.selected ? "sel" : ""}" style="--c:${o.color}">
    <div class="heading" style="transform:rotate(${o.course}deg)"><i></i></div>
    <div class="badge">${iconSvg(o.cat, 18, o.color)}</div>
  </div>${lbl}</div>`;
}

/**
 * Icon scale for a zoom level. The top-view truck is drawn 66px long for a ~16 m vehicle, so at street level it follows the real
 * ground size (the icon matches the road width); when zoomed out it stops shrinking at a readable minimum.
 */
const zoomScale = (z: number, lat: number) => {
  const mpp = 156543.03 * Math.cos((lat * Math.PI) / 180) / Math.pow(2, z); // metres per pixel
  const real = 16 / mpp / 66;
  return { top: Math.min(1.6, Math.max(0.4, real)), badge: Math.min(1.2, Math.max(0.65, real)) };
};

function parseArea(area: string): L.Layer | null {
  try {
    const m = area.match(/^(\w+)\s*\(([\s\S]*)\)$/);
    if (!m) return null;
    const type = m[1].toUpperCase();
    const style = { color: "#8b5cf6", weight: 2, fillOpacity: 0.14 };
    if (type === "CIRCLE") {
      const [c, r] = m[2].split(",");
      const [lat, lon] = c.trim().split(/\s+/).map(Number);
      return L.circle([lat, lon], { radius: Number(r), ...style });
    }
    const pts = m[2].replace(/[()]/g, "").split(",").map((s) => s.trim().split(/\s+/).map(Number) as [number, number]);
    return type === "POLYGON" ? L.polygon(pts, style) : L.polyline(pts, style);
  } catch { return null; }
}

interface Anim {
  marker: L.Marker; sig: string;
  from: [number, number]; to: [number, number]; cur: [number, number];
  fromC: number; toC: number; curC: number;
  t0: number; dur: number; lastChange: number; fix: string; state: string; name: string; trail: [number, number][];
  poly: L.Polyline; kmh: number; half: number; top: boolean;
}

interface Props {
  devices?: Device[];
  positions?: Position[];
  selectedId?: number | null;
  onSelect?: (id: number) => void;
  onDeselect?: () => void;
  /** Card shown anchored above the selected vehicle. */
  popup?: React.ReactNode;
  geofences?: Geofence[];
  route?: Position[];
  routeDevice?: Device | null;
  cursor?: number;
  follow?: boolean;
  className?: string;
  controlsSide?: "left" | "right";
}

export default function MapView({ devices = [], positions = [], selectedId, onSelect, onDeselect, popup, geofences = [], route, routeDevice, cursor = 0, follow, className, controlsSide = "right" }: Props) {
  const { t, dir } = useI18n();
  const el = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tile = useRef<L.Layer | null>(null);
  const zooming = useRef(false);
  const popRef = useRef<HTMLDivElement>(null);
  const scaleNow = useRef({ top: 1, badge: 1 });
  const deselect = useRef(onDeselect);
  deselect.current = onDeselect;
  const closeCtl = useRef(() => {});
  const anims = useRef(new Map<number, Anim>());
  const fenceLayer = useRef<L.LayerGroup | null>(null);
  const routeLayer = useRef<L.LayerGroup | null>(null);
  const heatLayer = useRef<L.Layer | null>(null);
  const routeMarker = useRef<L.Marker | null>(null);
  const fitted = useRef(false);
  const controlsSideRef = useRef(controlsSide);
  const raf = useRef(0);
  const { prefs, set: setPrefs, resolvedTheme } = usePrefs();
  const style = prefs.tile === "auto" ? (resolvedTheme === "light" ? "light" : "dark") : prefs.tile;
  const trails = prefs.trails, labels = prefs.labels;
  const [menu, setMenu] = useState(false);
  const [showFences, setShowFences] = useState(true);
  const [heat, setHeat] = useState(false);
  const [legend, setLegend] = useState(() => window.matchMedia("(min-width: 768px)").matches);
  const [near, setNear] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const enter = () => { clearTimeout(leaveTimer.current); setNear(true); };
  closeCtl.current = () => { clearTimeout(leaveTimer.current); setNear(false); };
  const leave = () => { clearTimeout(leaveTimer.current); leaveTimer.current = setTimeout(() => setNear(false), 700); };
  const [counts, setCounts] = useState<Record<VisualState, number>>({ over: 0, moving: 0, idle: 0, stopped: 0, offline: 0, nofix: 0 });
  const live = useRef({ trails, labels, selectedId, follow });
  live.current = { trails, labels, selectedId, follow };
  const applyScale = useCallback((zoom?: number) => {
    const m = map.current, e = el.current; if (!m || !e) return;
    const z = prefs.autoScale ? zoomScale(zoom ?? m.getZoom(), m.getCenter().lat) : { top: 1, badge: 1 };
    const top = z.top * prefs.iconSize, badge = z.badge * prefs.iconSize;
    e.style.setProperty("--s", top.toFixed(3));
    e.style.setProperty("--sb", badge.toFixed(3));
    scaleNow.current = { top, badge };
  }, [prefs.autoScale, prefs.iconSize]);
  const scaleRef = useRef(applyScale);
  scaleRef.current = applyScale;
  useEffect(() => { applyScale(); }, [applyScale]);

  // init map + animation loop
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, preferCanvas: true, zoomSnap: 0.5, zoomAnimation: true }).setView([30.04, 31.23], 6);
    L.control.zoom({ position: controlsSideRef.current === "left" ? "bottomleft" : "bottomright" }).addTo(m);
    map.current = m;
    // while Leaflet animates a zoom it positions the markers itself; moving them from our loop too made them jitter
    m.on("zoomstart", () => { zooming.current = true; });
    m.on("click", () => { deselect.current?.(); closeCtl.current(); }); // on touch screens a tap on the map also tucks the tools away
    // resize the icons toward the zoom we are heading to (zoomanim = target zoom), and follow flyTo / pinch frame by frame
    m.on("zoomanim", (e) => scaleRef.current((e as L.ZoomAnimEvent).zoom));
    m.on("zoom", () => scaleRef.current());
    m.on("zoomend", () => {
      zooming.current = false;
      anims.current.forEach((a) => a.marker.setLatLng(a.cur));
      scaleRef.current();
    });
    scaleRef.current();
    fenceLayer.current = L.layerGroup().addTo(m);
    routeLayer.current = L.layerGroup().addTo(m);
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);

    const frame = () => {
      const now = performance.now();
      anims.current.forEach((a, id) => {
        if (a.t0 > 0) {
          const k = Math.min(1, (now - a.t0) / a.dur), e = ease(k);
          a.cur = [a.from[0] + (a.to[0] - a.from[0]) * e, a.from[1] + (a.to[1] - a.from[1]) * e];
          a.curC = lerpAngle(a.fromC, a.toC, e);
          if (!zooming.current) a.marker.setLatLng(a.cur);
          const h = a.marker.getElement()?.querySelector<HTMLElement>(".heading");
          if (h) h.style.transform = `rotate(${a.curC}deg)`;
          if (k >= 1) a.t0 = 0;
          if (live.current.selectedId === id && live.current.follow) m.panTo(a.cur, { animate: false });
        }
      });
      const pe = popRef.current, sid = live.current.selectedId;
      const sa = pe && sid != null ? anims.current.get(sid) : null;
      if (pe && sa) {
        // keep the card glued to the vehicle: above it, flipped below when there is no room, clamped to the map edges
        const pt = m.latLngToContainerPoint(sa.cur), size = m.getSize(), w = pe.offsetWidth, h = pe.offsetHeight;
        const gap = sa.half * (sa.top ? scaleNow.current.top : scaleNow.current.badge) + 12;
        const above = pt.y - gap - 8, under = size.y - pt.y - gap - 8;
        const below = h > above && under > above; // more room under the vehicle than over it
        const room = Math.max(120, below ? under : above);
        pe.style.setProperty("--ph", `${Math.floor(room)}px`);
        const hh = Math.min(h, room);
        const y = below ? pt.y + gap : pt.y - gap - hh;
        const x = Math.min(Math.max(pt.x - w / 2, 8), Math.max(8, size.x - w - 8));
        pe.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px)`;
        pe.style.setProperty("--ax", `${Math.min(Math.max(pt.x - x, 18), w - 18).toFixed(1)}px`);
        pe.dataset.below = below ? "1" : "0";
        pe.style.opacity = zooming.current ? "0" : "1";
      }
      raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);
    const anim = anims.current;
    return () => { cancelAnimationFrame(raf.current); ro.disconnect(); m.remove(); map.current = null; anim.clear(); fitted.current = false; };
  }, []);

  useEffect(() => {
    const m = map.current; if (!m) return;
    let stale = false;
    const s = TILES[style];
    (async () => {
      let layer: L.Layer;
      if (s.kind === "vector" && !hasWebGL()) {
        // some phones / browsers cannot create a WebGL context: fall back to plain raster tiles (no Arabic shaping, but a working map)
        layer = L.tileLayer(RASTER_FALLBACK[s.hybrid ? "sat" : s.style === "dark" ? "dark" : "light"], { attribution: "Tiles © Esri", maxZoom: s.hybrid ? 19 : 19, maxNativeZoom: 18 });
      } else if (s.kind === "raster") {
        layer = L.tileLayer(s.url, { attribution: s.attr, subdomains: s.sub, maxZoom: s.maxZoom, keepBuffer: 4, updateWhenZooming: false });
      } else {
        const [{ maplibreGL }, gl] = await Promise.all([import("@maplibre/maplibre-gl-leaflet"), import("maplibre-gl")]);
        // Arabic labels need the RTL text plugin, otherwise glyphs are drawn left-to-right and disconnected
        if (!rtlReady) rtlReady = gl.setRTLTextPlugin("/mapbox-gl-rtl-text.js", false).catch(() => {});
        await rtlReady;
        const st = s.hybrid ? await hybridStyle() : `${OFM}/${s.style}`;
        layer = guardGlLayer(maplibreGL({ style: st, attribution: s.attr } as unknown as Parameters<typeof maplibreGL>[0]));
      }
      if (stale || !map.current) return;
      m.setMaxZoom(s.maxZoom);
      tile.current?.remove();
      tile.current = layer;
      layer.addTo(m);
      (layer as L.TileLayer).bringToBack?.();
    })().catch(() => {});
    return () => { stale = true; };
  }, [style]);

  useEffect(() => {
    const g = fenceLayer.current; if (!g) return;
    g.clearLayers();
    if (!showFences) return;
    geofences.forEach((f) => { const l = parseArea(f.area); if (l) { l.bindTooltip(esc(f.name), { sticky: true }); g.addLayer(l); } });
  }, [geofences, showFences]);

  // live fleet: create / update markers with smooth tweening
  useEffect(() => {
    const m = map.current; if (!m || route) return;
    const byDev = new Map(positions.map((p) => [p.deviceId, p]));
    const seen = new Set<number>();
    const bounds: L.LatLngTuple[] = [];
    const now = performance.now();
    const counts: Record<VisualState, number> = { over: 0, moving: 0, idle: 0, stopped: 0, offline: 0, nofix: 0 };
    devices.forEach((d) => {
      const p = byDev.get(d.id);
      if (!p || (p.latitude === 0 && p.longitude === 0)) return;
      seen.add(d.id);
      const ll: [number, number] = [p.latitude, p.longitude];
      bounds.push(ll);
      const { base: state, vs, color } = vehState(prefs, d, p);
      const kmh = Math.round(knToKmh(p.speed));
      counts[vs]++;
      const selected = d.id === selectedId;
      const half = d.category && TOP_VIEW[d.category] ? TOP_VIEW[d.category].h / 2 : 22;
      const sig = [d.category, color, vs, selected, d.name, labels].join("|");
      const labelText = `${d.name}${state === "moving" ? ` · ${kmh}` : ""}`;
      let a = anims.current.get(d.id);
      if (!a) {
        const marker = L.marker(ll, {
          icon: L.divIcon({ className: "", iconSize: [44, 44], iconAnchor: [22, 22], html: vehicleHtml({ cat: d.category, color, state: vs, selected, label: labelText, showLabel: labels, course: p.course || 0 }) }),
          zIndexOffset: selected ? 1000 : 0, keyboard: false,
        }).addTo(m);
        marker.on("click", () => onSelect?.(d.id));
        const poly = L.polyline([], { color, weight: 3, opacity: 0.55, interactive: false }).addTo(m);
        a = { marker, sig, from: ll, to: ll, cur: ll, fromC: p.course || 0, toC: p.course || 0, curC: p.course || 0, t0: 0, dur: 1, lastChange: now, fix: p.fixTime + p.latitude + p.longitude, state, name: d.name, trail: [ll], poly, kmh, half, top: !!(d.category && TOP_VIEW[d.category]) };
        anims.current.set(d.id, a);
      } else {
        const moved = a.to[0] !== ll[0] || a.to[1] !== ll[1];
        if (moved) {
          const dist = m.distance(a.cur, ll);
          let course = p.course || 0;
          if (!p.course && dist > 5) course = bearing(a.cur, ll);
          a.from = a.cur; a.to = ll; a.fromC = a.curC; a.toC = course;
          // jump straight to the reported fix: gliding over the update interval (up to 15 s) kept the marker behind
          // the real position and drew points along a straight line that the vehicle never reported
          a.dur = 1;
          a.t0 = now; a.lastChange = now;
          const last = a.trail[a.trail.length - 1];
          if (!last || m.distance(last, ll) > 8) { a.trail.push(ll); if (a.trail.length > 60) a.trail.shift(); }
        }
        if (a.sig !== sig) {
          a.marker.setIcon(L.divIcon({ className: "", iconSize: [44, 44], iconAnchor: [22, 22], html: vehicleHtml({ cat: d.category, color, state: vs, selected, label: labelText, showLabel: labels, course: a.curC }) }));
          a.marker.setZIndexOffset(selected ? 1000 : 0);
          a.poly.setStyle({ color });
          a.sig = sig;
        }
        const lbl = a.marker.getElement()?.querySelector(".lbl");
        if (lbl && lbl.textContent !== labelText) lbl.textContent = labelText;
        a.state = state; a.name = d.name; a.kmh = kmh; a.half = half; a.top = !!(d.category && TOP_VIEW[d.category]);
      }
      const visible = live.current.trails && state === "moving" && a.trail.length > 1;
      a.poly.setLatLngs(visible ? a.trail : []);
    });
    setCounts((c) => (JSON.stringify(c) === JSON.stringify(counts) ? c : counts));
    anims.current.forEach((a, id) => { if (!seen.has(id)) { a.marker.remove(); a.poly.remove(); anims.current.delete(id); } });
    if (!fitted.current && bounds.length) { m.fitBounds(bounds, { padding: [70, 70], maxZoom: 14 }); fitted.current = true; }
  }, [devices, positions, selectedId, route, onSelect, labels, trails, prefs.limit, prefs.colorMode, prefs.cMoving, prefs.cIdle, prefs.cStopped, prefs.cOver, prefs.cOffline]);

  useEffect(() => {
    const m = map.current; if (!m || route || !selectedId) return;
    const a = anims.current.get(selectedId);
    if (a) m.flyTo(a.cur, Math.max(m.getZoom(), 15), { duration: 0.9 });
  }, [selectedId, route]);

  // route mode
  useEffect(() => {
    const m = map.current, g = routeLayer.current; if (!m || !g) return;
    g.clearLayers(); routeMarker.current = null;
    heatLayer.current?.remove(); heatLayer.current = null;
    if (!route?.length) return;
    anims.current.forEach((a) => { a.marker.remove(); a.poly.remove(); }); anims.current.clear();
    const canvas = L.canvas({ padding: 0.5 });
    if (heat) {
      (window as unknown as { L: typeof L }).L = L;
      import("leaflet.heat").then(() => {
        if (!map.current) return;
        heatLayer.current = (L as unknown as { heatLayer: (p: number[][], o: object) => L.Layer })
          .heatLayer(route.map((p) => [p.latitude, p.longitude, 0.5]), { radius: 18, blur: 20 }).addTo(map.current);
      });
    } else {
      for (let i = 1; i < route.length; i++) {
        const a = route[i - 1], b = route[i];
        g.addLayer(L.polyline([[a.latitude, a.longitude], [b.latitude, b.longitude]], { color: speedColor(knToKmh(b.speed)), weight: 5, opacity: 0.9, renderer: canvas }));
      }
    }
    const s = route[0], e = route[route.length - 1];
    const pin = (p: Position, c: string, lab: string) =>
      L.circleMarker([p.latitude, p.longitude], { radius: 8, color: "#fff", weight: 2, fillColor: c, fillOpacity: 1 }).bindTooltip(lab);
    g.addLayer(pin(s, "#22c55e", t("map.start"))); g.addLayer(pin(e, "#f43f5e", t("map.end")));
    const color = deviceColor(routeDevice) || "#22d3ee";
    routeMarker.current = L.marker([s.latitude, s.longitude], {
      icon: L.divIcon({ className: "", iconSize: [44, 44], iconAnchor: [22, 22], html: vehicleHtml({ cat: routeDevice?.category, color, state: "moving", selected: true, label: "", showLabel: false, course: s.course || 0 }) }),
      zIndexOffset: 2000, interactive: false,
    }).addTo(g);
    m.fitBounds(route.map((p) => [p.latitude, p.longitude] as L.LatLngTuple), { padding: [50, 50] });
  }, [route, heat, routeDevice, t]);

  // playback cursor (fractional index → smooth interpolation between samples)
  useEffect(() => {
    const mk = routeMarker.current;
    if (!route?.length || !mk) return;
    // clamp: the cursor can briefly be stale/NaN while a new route is loading
    const last = route.length - 1;
    const c = Math.min(Math.max(Number.isFinite(cursor) ? cursor : 0, 0), last);
    const i = Math.floor(c), j = Math.min(i + 1, last), f = c - i;
    const a = route[i], b = route[j];
    if (!a || !b) return;
    const ll: [number, number] = [a.latitude + (b.latitude - a.latitude) * f, a.longitude + (b.longitude - a.longitude) * f];
    mk.setLatLng(ll);
    const h = mk.getElement()?.querySelector<HTMLElement>(".heading");
    const course = (a.latitude !== b.latitude || a.longitude !== b.longitude) ? bearing([a.latitude, a.longitude], [b.latitude, b.longitude]) : a.course;
    if (h) h.style.transform = `rotate(${course}deg)`;
    if (follow) map.current?.panTo(ll, { animate: false });
  }, [cursor, route, follow]);

  const fitAll = () => {
    const pts = [...anims.current.values()].map((a) => a.cur);
    if (pts.length) map.current?.fitBounds(pts, { padding: [70, 70], maxZoom: 14 });
  };
  const Btn = ({ on, onClick, title, children }: { on?: boolean; onClick: () => void; title: string; children: React.ReactNode }) => (
    <button className={`btn glass ${on ? "btn-on" : ""}`} onClick={onClick} title={title} aria-label={title}>{children}</button>
  );

  return (
    <div ref={wrap} className={`relative ${className ?? "h-full w-full"}`}>
      <div ref={el} className="absolute inset-0" dir="ltr" />
      {popup && selectedId != null && !route && (
        <div ref={popRef} className="absolute left-0 top-0 z-[650] pointer-events-none opacity-0 transition-opacity duration-200" style={{ width: "min(340px, calc(100% - 16px))" }} dir={dir}>
          <div className="pop-wrap pointer-events-auto relative">{popup}<i className="pop-arrow" /></div>
        </div>
      )}
      <div className={`absolute top-0 z-[500] p-3 ${controlsSide === "left" ? "left-0" : "right-0"}`} dir={dir}
        onPointerEnter={(e) => e.pointerType === "mouse" && canHover() && prefs.ctl === "auto" && enter()} onPointerLeave={(e) => e.pointerType === "mouse" && canHover() && leave()}>
      {!(prefs.ctl === "pinned" || (prefs.ctl === "auto" && (near || menu))) ? (
        <button className={`btn glass opacity-70 hover:opacity-100 ${controlsSide === "left" ? "" : "ms-auto"}`} title={t("map.showtools")} aria-label={t("map.showtools")}
          onClick={() => { setPrefs({ ctl: "auto" }); enter(); }}><SlidersHorizontal size={16} /></button>
      ) : (
      <div className={`flex flex-col gap-2 ${controlsSide === "left" ? "items-start" : "items-end"}`}>
        <div className="flex gap-2">
          <Btn onClick={() => setPrefs({ ctl: "hidden" })} title={t("map.hidetools")}><EyeOff size={16} /></Btn>
          <Btn on={prefs.ctl === "pinned"} onClick={() => setPrefs({ ctl: prefs.ctl === "pinned" ? "auto" : "pinned" })} title={prefs.ctl === "pinned" ? t("map.unpin") : t("map.pin")}>
            {prefs.ctl === "pinned" ? <Pin size={16} /> : <PinOff size={16} />}
          </Btn>
        </div>
        <Btn onClick={() => setMenu((v) => !v)} title={t("map.layers")} on={menu}><Layers size={16} /></Btn>
        {menu && (
          <div className="glass p-2 space-y-1 text-sm min-w-40">
            {[["auto", t("map.auto")] as const, ...Object.entries(TILES).map(([k, s]) => [k, t(s.key)] as const)].map(([k, label]) => (
              <button key={k} onClick={() => { setPrefs({ tile: k as typeof prefs.tile }); setMenu(false); }}
                className={`block w-full text-start px-3 py-1.5 rounded-lg ${prefs.tile === k ? "btn-on border border-accent/40" : "hover:bg-fg/5"}`}>{label}</button>
            ))}
          </div>
        )}
        {geofences.length > 0 && <Btn on={showFences} onClick={() => setShowFences((v) => !v)} title={t("map.fences")}><Hexagon size={16} /></Btn>}
        {route ? <Btn on={heat} onClick={() => setHeat((v) => !v)} title={t("map.heat")}><Flame size={16} /></Btn> : (
          <>
            <Btn on={trails} onClick={() => setPrefs({ trails: !trails })} title={t("map.trails")}><RouteIcon size={16} /></Btn>
            <Btn on={labels} onClick={() => setPrefs({ labels: !labels })} title={t("map.labels")}><Tag size={16} /></Btn>
            <Btn on={legend} onClick={() => setLegend((v) => !v)} title={t("map.legend")}><Palette size={16} /></Btn>
            <Btn onClick={fitAll} title={t("map.fit")}><Crosshair size={16} /></Btn>
          </>
        )}
        {!route && legend && (
          <div className="glass p-2 space-y-1 text-[11px] min-w-36">
            {([["over", prefs.cOver, "state.over"], ["moving", prefs.cMoving, "state.moving"], ["idle", prefs.cIdle, "state.idle"], ["stopped", prefs.cStopped, "state.stopped"], ["offline", prefs.cOffline, "state.offline"]] as const)
              .map(([k, c, label]) => (
                <div key={k} className="flex items-center gap-2"><i className="size-2.5 rounded-full shrink-0" style={{ background: c }} /><span className="flex-1">{t(label)}</span><b className="tabular-nums">{counts[k] + (k === "offline" ? counts.nofix : 0)}</b></div>
              ))}
          </div>
        )}
        <Btn onClick={() => { const w = wrap.current; if (!w) return; document.fullscreenElement ? document.exitFullscreen() : w.requestFullscreen?.(); }} title={t("map.fullscreen")}><Maximize2 size={16} /></Btn>
      </div>
      )}
      </div>
    </div>
  );
}
