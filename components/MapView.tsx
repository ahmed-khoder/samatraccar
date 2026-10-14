"use client";
import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { Device, Geofence, Position } from "@/lib/types";
import { deviceState, knToKmh, speedColor, STATE_COLOR } from "@/lib/format";
import { Layers, Crosshair, Flame, Hexagon } from "lucide-react";

const TILES: Record<string, { name: string; url: string; attr: string; sub?: string }> = {
  dark: { name: "Dark", url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attr: "© OpenStreetMap © CARTO", sub: "abcd" },
  light: { name: "Light", url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", attr: "© OpenStreetMap © CARTO", sub: "abcd" },
  osm: { name: "OpenStreetMap", url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png", attr: "© OpenStreetMap contributors", sub: "abc" },
  topo: { name: "Topographic", url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attr: "© OpenTopoMap (CC-BY-SA)", sub: "abc" },
};

function arrowIcon(d: Device, p: Position, selected: boolean) {
  const st = deviceState(d, p);
  const color = STATE_COLOR[st];
  const kmh = Math.round(knToKmh(p.speed));
  return L.divIcon({
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    html: `<div class="veh-marker ${st}" style="color:${color}">
      <div class="dot" style="background:${color};${selected ? "box-shadow:0 0 0 4px rgba(255,255,255,.35),0 4px 14px rgba(0,0,0,.6)" : ""}">
        <svg width="18" height="18" viewBox="0 0 24 24" style="transform:rotate(${p.course || 0}deg)" fill="#04101c"><path d="M12 2 4.5 21l7.5-4.5L19.5 21z"/></svg>
      </div>
      <div class="lbl">${d.name.replace(/</g, "&lt;")}${st === "moving" ? ` · ${kmh}` : ""}</div></div>`,
  });
}

function parseArea(area: string): L.Layer | null {
  try {
    const m = area.match(/^(\w+)\s*\((.*)\)$/s);
    if (!m) return null;
    const type = m[1].toUpperCase();
    const style = { color: "#8b5cf6", weight: 2, fillOpacity: 0.12 };
    if (type === "CIRCLE") {
      const [c, r] = m[2].split(",");
      const [lat, lon] = c.trim().split(/\s+/).map(Number);
      return L.circle([lat, lon], { radius: Number(r), ...style });
    }
    const pts = m[2].replace(/[()]/g, "").split(",").map((s) => s.trim().split(/\s+/).map(Number) as [number, number]);
    return type === "POLYGON" ? L.polygon(pts, style) : L.polyline(pts, style);
  } catch { return null; }
}

interface Props {
  devices?: Device[];
  positions?: Position[];
  selectedId?: number | null;
  onSelect?: (id: number) => void;
  geofences?: Geofence[];
  route?: Position[];
  cursor?: number; // index into route
  follow?: boolean;
  className?: string;
}

export default function MapView({ devices = [], positions = [], selectedId, onSelect, geofences = [], route, cursor, follow, className }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const tile = useRef<L.TileLayer | null>(null);
  const markers = useRef(new Map<number, L.Marker>());
  const fenceLayer = useRef<L.LayerGroup | null>(null);
  const routeLayer = useRef<L.LayerGroup | null>(null);
  const heatLayer = useRef<L.Layer | null>(null);
  const cursorMarker = useRef<L.CircleMarker | null>(null);
  const fitted = useRef(false);
  const [style, setStyle] = useState("dark");
  const [menu, setMenu] = useState(false);
  const [showFences, setShowFences] = useState(true);
  const [heat, setHeat] = useState(false);

  useEffect(() => {
    try { const s = localStorage.getItem("tile"); if (s && TILES[s]) setStyle(s); } catch {}
  }, []);

  // init
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, preferCanvas: true }).setView([30.04, 31.23], 6);
    L.control.zoom({ position: "bottomright" }).addTo(m);
    map.current = m;
    fenceLayer.current = L.layerGroup().addTo(m);
    routeLayer.current = L.layerGroup().addTo(m);
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); m.remove(); map.current = null; markers.current.clear(); fitted.current = false; };
  }, []);

  // tiles
  useEffect(() => {
    const m = map.current; if (!m) return;
    tile.current?.remove();
    const t = TILES[style];
    tile.current = L.tileLayer(t.url, { attribution: t.attr, subdomains: t.sub, maxZoom: 19 }).addTo(m);
    tile.current.bringToBack();
    try { localStorage.setItem("tile", style); } catch {}
  }, [style]);

  // geofences
  useEffect(() => {
    const g = fenceLayer.current; if (!g) return;
    g.clearLayers();
    if (!showFences) return;
    geofences.forEach((f) => { const l = parseArea(f.area); if (l) { l.bindTooltip(f.name, { sticky: true }); g.addLayer(l); } });
  }, [geofences, showFences]);

  // fleet markers
  useEffect(() => {
    const m = map.current; if (!m || route) return;
    const byDev = new Map(positions.map((p) => [p.deviceId, p]));
    const seen = new Set<number>();
    const bounds: L.LatLngTuple[] = [];
    devices.forEach((d) => {
      const p = byDev.get(d.id);
      if (!p) return;
      seen.add(d.id);
      bounds.push([p.latitude, p.longitude]);
      let mk = markers.current.get(d.id);
      const icon = arrowIcon(d, p, d.id === selectedId);
      if (!mk) {
        mk = L.marker([p.latitude, p.longitude], { icon, zIndexOffset: d.id === selectedId ? 1000 : 0 }).addTo(m);
        mk.on("click", () => onSelect?.(d.id));
        markers.current.set(d.id, mk);
      } else {
        mk.setLatLng([p.latitude, p.longitude]).setIcon(icon).setZIndexOffset(d.id === selectedId ? 1000 : 0);
      }
    });
    markers.current.forEach((mk, id) => { if (!seen.has(id)) { mk.remove(); markers.current.delete(id); } });
    if (!fitted.current && bounds.length) { m.fitBounds(bounds, { padding: [60, 60], maxZoom: 15 }); fitted.current = true; }
  }, [devices, positions, selectedId, route, onSelect]);

  // focus selected
  useEffect(() => {
    const m = map.current; if (!m || route || !selectedId) return;
    const p = positions.find((x) => x.deviceId === selectedId);
    if (p) m.flyTo([p.latitude, p.longitude], Math.max(m.getZoom(), 15), { duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // route
  useEffect(() => {
    const m = map.current, g = routeLayer.current; if (!m || !g) return;
    g.clearLayers(); cursorMarker.current = null;
    heatLayer.current?.remove(); heatLayer.current = null;
    if (!route?.length) return;
    markers.current.forEach((mk) => mk.remove()); markers.current.clear();
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
        g.addLayer(L.polyline([[a.latitude, a.longitude], [b.latitude, b.longitude]], {
          color: speedColor(knToKmh(b.speed)), weight: 5, opacity: 0.9, renderer: canvas,
        }));
      }
    }
    const s = route[0], e = route[route.length - 1];
    const pin = (p: Position, c: string, t: string) =>
      L.circleMarker([p.latitude, p.longitude], { radius: 8, color: "#fff", weight: 2, fillColor: c, fillOpacity: 1 }).bindTooltip(t);
    g.addLayer(pin(s, "#22c55e", "Start")); g.addLayer(pin(e, "#f43f5e", "End"));
    cursorMarker.current = L.circleMarker([s.latitude, s.longitude], { radius: 10, color: "#fff", weight: 3, fillColor: "#22d3ee", fillOpacity: 1 }).addTo(g);
    m.fitBounds(route.map((p) => [p.latitude, p.longitude] as L.LatLngTuple), { padding: [50, 50] });
  }, [route, heat]);

  useEffect(() => {
    if (!route || cursor == null || !cursorMarker.current) return;
    const p = route[Math.min(cursor, route.length - 1)];
    if (!p) return;
    cursorMarker.current.setLatLng([p.latitude, p.longitude]);
    if (follow) map.current?.panTo([p.latitude, p.longitude], { animate: true, duration: 0.3 });
  }, [cursor, route, follow]);

  return (
    <div className={`relative ${className ?? "h-full w-full"}`}>
      <div ref={el} className="absolute inset-0" />
      <div className="absolute top-3 right-3 z-[500] flex flex-col items-end gap-2">
        <button className="btn glass" onClick={() => setMenu((v) => !v)} aria-label="Map layers"><Layers size={16} /></button>
        {menu && (
          <div className="glass p-2 space-y-1 text-sm min-w-40">
            {Object.entries(TILES).map(([k, t]) => (
              <button key={k} onClick={() => { setStyle(k); setMenu(false); }}
                className={`block w-full text-left px-3 py-1.5 rounded-lg ${style === k ? "btn-on border border-accent/40" : "hover:bg-white/5"}`}>{t.name}</button>
            ))}
          </div>
        )}
        {geofences.length > 0 && (
          <button className={`btn glass ${showFences ? "btn-on" : ""}`} onClick={() => setShowFences((v) => !v)} title="Geofences"><Hexagon size={16} /></button>
        )}
        {route && (
          <button className={`btn glass ${heat ? "btn-on" : ""}`} onClick={() => setHeat((v) => !v)} title="Heatmap"><Flame size={16} /></button>
        )}
        {!route && (
          <button className="btn glass" title="Fit all" onClick={() => {
            const pts = positions.map((p) => [p.latitude, p.longitude] as L.LatLngTuple);
            if (pts.length) map.current?.fitBounds(pts, { padding: [60, 60], maxZoom: 15 });
          }}><Crosshair size={16} /></button>
        )}
      </div>
    </div>
  );
}
