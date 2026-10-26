"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Palette, Battery, Clock, Search, History } from "lucide-react";
import { useAnalytics, useDevices, usePositions } from "@/lib/api";
import { fmtNum, knToKmh, mToKm, rangeDates, timeAgo } from "@/lib/format";
import { iconOf } from "@/lib/vehicle";
import { vehState } from "@/lib/vstate";
import { usePrefs } from "@/lib/prefs";
import { useI18n } from "@/lib/i18n";
import type { Device } from "@/lib/types";
import DeviceEditor from "@/components/DeviceEditor";
import { Skeleton } from "@/components/ui";

export default function Vehicles() {
  const { t } = useI18n();
  const { prefs } = usePrefs();
  const { data: devices } = useDevices();
  const { data: positions } = usePositions();
  const range = useMemo(() => rangeDates("today"), []);
  const an = useAnalytics(range);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<Device | null>(null);
  const pos = useMemo(() => new Map((positions ?? []).map((p) => [p.deviceId, p])), [positions]);
  const list = (devices ?? []).filter((d) => d.name.toLowerCase().includes(q.toLowerCase()) || d.uniqueId.includes(q));

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("nav.vehicles")}</h1>
          <p className="text-xs text-muted">{t("veh.subtitle")}</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className="input !ps-9" placeholder={t("live.search")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
        {!devices && Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
        {list.map((d) => {
          const p = pos.get(d.id);
          const { base: st, vs, color: c } = vehState(prefs, d, p);
          const I = iconOf(d.category);
          const today = an.perDevice.get(d.id);
          return (
            <div key={d.id} className="glass p-4 space-y-3 rise">
              <div className="flex items-center gap-3">
                <span className="size-12 rounded-2xl grid place-items-center shrink-0" style={{ background: c + "22", color: c }}><I size={26} /></span>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold truncate">{d.name}</h3>
                  <p className="text-xs flex items-center gap-1.5" style={{ color: c }}>
                    <span className="size-2 rounded-full" style={{ background: c }} />{t(`state.${vs === "nofix" ? "nofix" : vs === "offline" ? "offline" : vs}` as const)}
                    <span className="text-muted">· {fmtNum(knToKmh(p?.speed))} {t("unit.kmh")}</span>
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-fg/[.05] rounded-xl p-2"><div className="text-[10px] text-muted">{t("veh.today")}</div><div className="text-sm font-medium tabular-nums">{today ? fmtNum(mToKm(today.dist), 1) : "–"} <span className="text-[10px] text-muted">{t("unit.km")}</span></div></div>
                <div className="bg-fg/[.05] rounded-xl p-2"><div className="text-[10px] text-muted flex justify-center gap-1"><Battery size={11} />{t("stat.battery")}</div><div className="text-sm font-medium tabular-nums">{p?.attributes.batteryLevel != null ? `${p.attributes.batteryLevel}%` : "—"}</div></div>
                <div className="bg-fg/[.05] rounded-xl p-2"><div className="text-[10px] text-muted flex justify-center gap-1"><Clock size={11} />{t("veh.seen")}</div><div className="text-sm font-medium">{timeAgo(p?.serverTime ?? d.lastUpdate)}</div></div>
              </div>
              <div className="flex gap-2">
                <Link href={`/devices/${d.id}`} className="btn btn-on flex-1 justify-center"><History size={14} />{t("veh.details")}</Link>
                <button className="btn" onClick={() => setEdit(d)} title={t("edit.title")}><Palette size={14} />{t("edit.customize")}</button>
              </div>
            </div>
          );
        })}
      </div>
      {edit && <DeviceEditor device={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}
