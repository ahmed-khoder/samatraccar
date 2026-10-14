"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { Device, Geofence, Position } from "@/lib/types";
import { deviceState, knToKmh, speedColor, STATE_COLOR } from "@/lib/format";
import { deviceColor, iconSvg, TOP_VIEW } from "@/lib/vehicle";
import { useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { Layers, Crosshair, Flame, Hexagon, Route as RouteIcon, Tag, Maximize2 } from "lucide-react";

const OSM = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILES: Record<string, { key: "map.dark" | "map.light" | "map.topo" | "map.sat"; url: string; attr: string; sub: string; cls?: string }> = {
  dark: { key: "map.dark", url: OSM, attr: "© OpenStreetMap contributors", sub: "abc", cls: "tiles-dark" },
  light: { key: "map.light", url: OSM, attr: "© OpenStreetMap contributors", sub: "abc", cls: "tiles-soft" },
  sat: { key: "map.sat", url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Imagery © Esri", sub: "abc" },
  topo: { key: "map.topo", url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attr: "© OpenTopoMap (CC-BY-SA)", sub: "abc" },
};

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
  if (top) {
    return `<div class="veh top ${o.state} ${o.selected ? "sel" : ""}" style="--c:${o.color}">
      ${o.selected ? '<div class="ring"></div>' : ""}
      <div class="heading" style="transform:rotate(${o.course}deg)"><div class="shape" style="width:${top.w}px;height:${top.h}px;margin:${-top.h / 2}px 0 0 ${-top.w / 2}px">${top.svg(o.color)}</div></div>
      ${o.showLabel ? `<div class="lbl">${esc(o.label)}</div>` : ""}
    </div>`;
  }
  return `<div class="veh ${o.state} ${o.selected ? "sel" : ""}" style="--c:${o.color}">
    <div class="heading" style="transform:rotate(${o.course}deg)"><i></i></div>
    <div class="badge">${iconSvg(o.cat, 18, o.color)}</div>
    ${o.showLabel ? `<div class="lbl">${esc(o.label)}</div>` : ""}
  </div>`;
}

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
  poly: L.Polyline; kmh: number;
}

interface Props {
  devices?: Device[];
  positions?: Position[];
  selectedId?: number | null;
  onSelect?: (id: number) => void;
  geofences?: Geofence[];
  route?: Position[];
  routeDevice?: Device | null;
  cursor?: number;
  follow?: boolean;
  className?: string;
  controlsSide?: "left" | "right";
}

export default function MapView({ devices = [], positions = [], selectedId, onSelect, geofences = [], route, routeDevice, cursor = 0, follow, className, controlsSide = "right" }: Props) {
  const { t, dir } = useI18n();
  const el = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tile = useRef<L.TileLayer | null>(null);
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
  const live = useRef({ trails, labels, selectedId, follow });
  live.current = { trails, labels, selectedId, follow };

  // init map + animation loop
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, preferCanvas: true, zoomSnap: 0.5, zoomAnimation: true }).setView([30.04, 31.23], 6);
    L.control.zoom({ position: controlsSideRef.current === "left" ? "bottomleft" : "bottomright" }).addTo(m);
    map.current = m;
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
          a.marker.setLatLng(a.cur);
          const h = a.marker.getElement()?.querySelector<HTMLElement>(".heading");
          if (h) h.style.transform = `rotate(${a.curC}deg)`;
          if (k >= 1) a.t0 = 0;
          if (live.current.selectedId === id && live.current.follow) m.panTo(a.cur, { animate: false });
        }
      });
      raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);
    const anim = anims.current;
    return () => { cancelAnimationFrame(raf.current); ro.disconnect(); m.remove(); map.current = null; anim.clear(); fitted.current = false; };
  }, []);

  useEffect(() => {
    const m = map.current; if (!m) return;
    tile.current?.remove();
    const s = TILES[style];
    tile.current = L.tileLayer(s.url, { attribution: s.attr, subdomains: s.sub, maxZoom: 19, className: s.cls }).addTo(m);
    tile.current.bringToBack();
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
    devices.forEach((d) => {
      const p = byDev.get(d.id);
      if (!p || (p.latitude === 0 && p.longitude === 0)) return;
      seen.add(d.id);
      const ll: [number, number] = [p.latitude, p.longitude];
      bounds.push(ll);
      const state = deviceState(d, p);
      const color = deviceColor(d) || STATE_COLOR[state];
      const selected = d.id === selectedId;
      const sig = [d.category, color, state, selected, d.name, labels].join("|");
      const kmh = Math.round(knToKmh(p.speed));
      const labelText = `${d.name}${state === "moving" ? ` · ${kmh}` : ""}`;
      let a = anims.current.get(d.id);
      if (!a) {
        const marker = L.marker(ll, {
          icon: L.divIcon({ className: "", iconSize: [44, 44], iconAnchor: [22, 22], html: vehicleHtml({ cat: d.category, color, state, selected, label: labelText, showLabel: labels, course: p.course || 0 }) }),
          zIndexOffset: selected ? 1000 : 0, keyboard: false,
        }).addTo(m);
        marker.on("click", () => onSelect?.(d.id));
        const poly = L.polyline([], { color, weight: 3, opacity: 0.55, interactive: false }).addTo(m);
        a = { marker, sig, from: ll, to: ll, cur: ll, fromC: p.course || 0, toC: p.course || 0, curC: p.course || 0, t0: 0, dur: 1, lastChange: now, fix: p.fixTime + p.latitude + p.longitude, state, name: d.name, trail: [ll], poly, kmh };
        anims.current.set(d.id, a);
      } else {
        const moved = a.to[0] !== ll[0] || a.to[1] !== ll[1];
        if (moved) {
          const gap = now - a.lastChange;
          const dist = m.distance(a.cur, ll);
          let course = p.course || 0;
          if (!p.course && dist > 5) course = bearing(a.cur, ll);
          a.from = a.cur; a.to = ll; a.fromC = a.curC; a.toC = course;
          // glide over the observed update interval so motion looks continuous
          a.dur = dist > 3000 ? 900 : Math.min(15000, Math.max(1200, gap));
          a.t0 = now; a.lastChange = now;
          const last = a.trail[a.trail.length - 1];
          if (!last || m.distance(last, ll) > 8) { a.trail.push(ll); if (a.trail.length > 60) a.trail.shift(); }
        }
        if (a.sig !== sig) {
          a.marker.setIcon(L.divIcon({ className: "", iconSize: [44, 44], iconAnchor: [22, 22], html: vehicleHtml({ cat: d.category, color, state, selected, label: labelText, showLabel: labels, course: a.curC }) }));
          a.marker.setZIndexOffset(selected ? 1000 : 0);
          a.poly.setStyle({ color });
          a.sig = sig;
        }
        const lbl = a.marker.getElement()?.querySelector(".lbl");
        if (lbl && lbl.textContent !== labelText) lbl.textContent = labelText;
        a.state = state; a.name = d.name; a.kmh = kmh;
      }
      const visible = live.current.trails && state === "moving" && a.trail.length > 1;
      a.poly.setLatLngs(visible ? a.trail : []);
    });
    anims.current.forEach((a, id) => { if (!seen.has(id)) { a.marker.remove(); a.poly.remove(); anims.current.delete(id); } });
    if (!fitted.current && bounds.length) { m.fitBounds(bounds, { padding: [70, 70], maxZoom: 14 }); fitted.current = true; }
  }, [devices, positions, selectedId, route, onSelect, labels, trails]);

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
      <div className={`absolute top-3 z-[500] flex flex-col gap-2 ${controlsSide === "left" ? "left-3 items-start" : "right-3 items-end"}`} dir={dir}>
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
            <Btn onClick={fitAll} title={t("map.fit")}><Crosshair size={16} /></Btn>
          </>
        )}
        <Btn onClick={() => { const w = wrap.current; if (!w) return; document.fullscreenElement ? document.exitFullscreen() : w.requestFullscreen?.(); }} title={t("map.fullscreen")}><Maximize2 size={16} /></Btn>
      </div>
    </div>
  );
}
