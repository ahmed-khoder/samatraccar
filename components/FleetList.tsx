"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Ban, Barcode, BatteryMedium, EllipsisVertical, IdCard, KeyRound, Phone, Route, Map as MapIcon, Navigation, History, Palette, Search, X } from "lucide-react";
import { powerOf, useFleetSince } from "@/lib/api";
import { fleetTab, mapsDirections } from "@/lib/fleet";
import { fmtDuration, fmtNum, knToKmh, noFix } from "@/lib/format";
import { iconOf } from "@/lib/vehicle";
import { vehState } from "@/lib/vstate";
import { usePrefs } from "@/lib/prefs";
import { useI18n } from "@/lib/i18n";
import type { Key } from "@/lib/dict";
import type { Device, Position } from "@/lib/types";
import DeviceEditor from "@/components/DeviceEditor";
import VehicleInfo from "@/components/VehicleInfo";

type Tab = "all" | "online" | "offline";

/** Phone vehicle list, laid out like the iTrack app: tabs by connection, one row per vehicle, actions in a sheet. */
export default function FleetList({ devices, positions, now, simCut }: { devices: Device[]; positions: Map<number, Position>; now: number; simCut: Set<number> }) {
  const { t } = useI18n();
  const { prefs } = usePrefs();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const [menu, setMenu] = useState<Device | null>(null);
  const [edit, setEdit] = useState<Device | null>(null);
  const [info, setInfo] = useState<Device | null>(null);

  const rows = useMemo(() => devices.map((d) => {
    const p = positions.get(d.id);
    const v = vehState(prefs, d, p);
    const a = p?.attributes ?? {};
    const live = d.status === "online" && !!p;
    const moving = v.base === "moving" ? true : v.base === "stopped" ? false : undefined;
    return {
      id: d.id, d, p, ...v,
      ign: live && typeof a.ignition === "boolean" ? a.ignition : undefined,
      motion: live && moving !== undefined && (a.motion === moving || (moving === false && noFix(p))) ? moving : undefined,
    };
  }), [devices, positions, prefs]);
  const since = useFleetSince(rows);
  const counts = { all: rows.length, online: rows.filter((r) => fleetTab(r.d.status) === "online").length, offline: 0 };
  counts.offline = counts.all - counts.online;
  const shown = rows.filter((r) => (tab === "all" || fleetTab(r.d.status) === tab)
    && (r.d.name.toLowerCase().includes(q.toLowerCase()) || r.d.uniqueId.includes(q) || (r.d.phone ?? "").includes(q)));

  const stateText = (r: (typeof rows)[number]) => {
    if (r.base === "moving") return `${t("card.moving")} · ${fmtNum(knToKmh(r.p?.speed))} ${t("unit.kmh")}`;
    return t("card.stopped"); // a vehicle that stopped reporting counts as stopped
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
        <input className="input !ps-9" placeholder={t("live.search")} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="grid grid-cols-3 border-b border-line text-sm">
        {(["all", "online", "offline"] as const).map((k) => (
          <button key={k} onClick={() => setTab(k)} className={`py-2.5 border-b-2 -mb-px ${tab === k ? "border-accent text-accent font-medium" : "border-transparent text-muted"}`}>
            {t(`fleet.${k}` as Key)}[{counts[k]}]
          </button>
        ))}
      </div>

      <ul className="divide-y divide-line">
        {shown.map((r) => {
          const I = iconOf(r.d.category);
          const s = since.get(r.d.id);
          // how long it has been like this: the proven state start for a live vehicle, else time since it was last heard from
          const dur = r.d.status === "online" ? s?.motion : r.d.lastUpdate ? Date.parse(r.d.lastUpdate) : null;
          const ign = r.ign;
          return (
            <li key={r.d.id} className="flex items-center gap-3 py-3">
              <div className="w-14 shrink-0 flex flex-col items-center gap-1">
                <span className="relative size-11 rounded-xl grid place-items-center" style={{ background: r.color + "22", color: r.color }}>
                  <I size={24} />
                  {simCut.has(r.d.id) && <Ban size={16} strokeWidth={3} className="absolute -top-1 -end-1 rounded-full bg-white text-[#e11d1d]" />}
                </span>
                {dur != null && Number.isFinite(dur) && <span className="text-[10.5px] tabular-nums leading-none" style={{ color: r.color }}>{fmtDuration(now - dur)}</span>}
              </div>
              <button onClick={() => setInfo(r.d)} className="min-w-0 flex-1 space-y-0.5 text-start">
                <div className="truncate">
                  <span className="font-semibold">{r.d.name}</span>
                  {r.d.model && <span className="text-accent text-sm"> ({r.d.model})</span>}
                </div>
                <div className="flex items-center gap-3 text-[11.5px] text-fg/80 tabular-nums" dir="ltr">
                  <span className="flex items-center gap-1"><Barcode size={12} />{r.d.uniqueId}</span>
                  {r.d.phone && <span className="flex items-center gap-1"><Phone size={12} />{r.d.phone}</span>}
                </div>
                <div className="flex items-center gap-3 text-[11px] text-muted">
                  {ign !== undefined && (
                    <span className="flex items-center gap-1"><KeyRound size={12} />{t(ign ? "fleet.engon" : "fleet.engoff")}
                      {s?.ign != null && <span className="tabular-nums">({fmtDuration(now - s.ign)})</span>}
                    </span>
                  )}
                  {(r.p?.attributes.batteryLevel ?? powerOf(r.d.id)?.batteryLevel) != null && <span className="flex items-center gap-1"><BatteryMedium size={12} />{r.p?.attributes.batteryLevel ?? powerOf(r.d.id)?.batteryLevel}%</span>}
                </div>
              </button>
              <div className="shrink-0 flex flex-col items-end gap-1">
                <span className="text-xs font-medium" style={{ color: r.color }}>{stateText(r)}</span>
                <button onClick={() => setMenu(r.d)} className="p-1.5 -me-1.5 text-muted" aria-label={t("fleet.actions")}><EllipsisVertical size={18} /></button>
              </div>
            </li>
          );
        })}
      </ul>

      {menu && (() => {
        const p = positions.get(menu.id);
        const item = "flex items-center gap-3 rounded-2xl border border-line px-4 py-3.5 text-sm active:bg-fg/5";
        return (
          <div className="fixed inset-0 z-[2100] bg-black/40" onClick={() => setMenu(null)}>
            <div role="dialog" aria-label={t("fleet.actions")} onClick={(e) => e.stopPropagation()}
              className="sheet-up fixed inset-x-0 bottom-0 rounded-t-3xl border-t border-line bg-solid p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2">
              <div className="flex items-center justify-between pb-1">
                <span className="font-semibold">{menu.name}</span>
                <button onClick={() => setMenu(null)} className="btn !p-1.5" aria-label={t("common.close")}><X size={14} /></button>
              </div>
              <button onClick={() => { setInfo(menu); setMenu(null); }} className={`${item} w-full`}><IdCard size={18} />{t("info.open")}</button>
              <Link href={`/playback/${menu.id}`} className={item}><Route size={18} className="text-blue-600" />{t("pb.open")}</Link>
              {p ? <Link href={`/live?v=${menu.id}`} className={item}><MapIcon size={18} />{t("fleet.onmap")}</Link> : <p className="text-xs text-muted px-1">{t("fleet.nopos")}</p>}
              {p && <a href={mapsDirections(p.latitude, p.longitude)} target="_blank" rel="noopener" className={item}><Navigation size={18} />{t("fleet.navigate")}</a>}
              <Link href={`/devices/${menu.id}`} className={item}><History size={18} />{t("veh.details")}</Link>
              <button onClick={() => { setEdit(menu); setMenu(null); }} className={`${item} w-full`}><Palette size={18} />{t("edit.title")}</button>
            </div>
          </div>
        );
      })()}
      {info && <VehicleInfo device={devices.find((x) => x.id === info.id) ?? info} position={positions.get(info.id)} onClose={() => setInfo(null)} onEdit={() => { setEdit(info); setInfo(null); }} />}
      {edit && <DeviceEditor device={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
