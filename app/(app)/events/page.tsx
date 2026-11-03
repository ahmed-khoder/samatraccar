"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bell, CheckCheck, Gauge, Hexagon, KeyRound, Siren, Truck, Wifi, WifiOff } from "lucide-react";
import { useDevices, useGeofences, useReport } from "@/lib/api";
import { fmtDateTime, timeAgo } from "@/lib/format";
import { usePersisted, useRangeSel } from "@/lib/hooks";
import { isUnread } from "@/lib/fleet";
import { stamp } from "@/lib/tz";
import { EVENT_COLOR, EVENT_TYPES, alarmLabel, evLabel } from "@/lib/events";
import { useI18n } from "@/lib/i18n";
import type { TEvent } from "@/lib/types";
import { Card, Empty, RangeBar, Skeleton } from "@/components/ui";

// one glyph per kind of alert, as in the iTrack app
const EV_ICON: Record<string, typeof Bell> = {
  deviceOverspeed: Gauge, alarm: Siren, ignitionOn: KeyRound, ignitionOff: KeyRound, geofenceEnter: Hexagon, geofenceExit: Hexagon,
  deviceOnline: Wifi, deviceOffline: WifiOff, deviceUnknown: WifiOff, deviceInactive: WifiOff, deviceMoving: Truck, deviceStopped: Truck,
};

export default function Events() {
  const { t } = useI18n();
  const { range, setRange, custom, setCustom, win: r } = useRangeSel("today");
  const [type, setType] = useState("all");
  const [dev, setDev] = useState(0);
  const { data: devices } = useDevices();
  const { data: fences } = useGeofences();
  const { data, isLoading } = useReport<TEvent[]>("events", r, dev || null, "", { refreshInterval: range === "today" ? 15000 : 0 });
  const names = useMemo(() => new Map((devices ?? []).map((d) => [d.id, d.name])), [devices]);
  const fenceName = useMemo(() => new Map((fences ?? []).map((f) => [f.id, f.name])), [fences]);
  const rows = useMemo(() => [...(data ?? [])].filter((e) => type === "all" || e.type === type).sort((a, b) => b.eventTime.localeCompare(a.eventTime)), [data, type]);
  const [seenAt, setSeenAt] = usePersisted("alerts.seenAt", 0);
  const counts = useMemo(() => { const m = new Map<string, number>(); (data ?? []).forEach((e) => m.set(e.type, (m.get(e.type) ?? 0) + 1)); return m; }, [data]);

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4">
      {/* phones: the alert list as in the iTrack app; unread = newer than the last "mark all as read" */}
      <div className="md:hidden space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">{t("nav.events")}</h1>
          <button className="btn !py-1.5 text-xs" onClick={() => setSeenAt(Date.now())}><CheckCheck size={14} />{t("fleet.markread")}</button>
        </div>
        <RangeBar value={range} custom={custom} onPreset={setRange} onCustom={setCustom} win={r} />
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          <button className={`btn shrink-0 ${type === "all" ? "btn-on" : ""}`} onClick={() => setType("all")}>{t("state.all")} {data?.length ?? 0}</button>
          {EVENT_TYPES.filter((x) => counts.has(x)).map((x) => (
            <button key={x} className={`btn shrink-0 ${type === x ? "btn-on" : ""}`} onClick={() => setType(x)}>{evLabel(t, x)} {counts.get(x)}</button>
          ))}
        </div>
        {isLoading ? <Skeleton className="h-60" /> : rows.length ? (
          <ul className="divide-y divide-line">
            {rows.slice(0, 300).map((e) => {
              const c = EVENT_COLOR[e.type] ?? "#64748b", I = EV_ICON[e.type] ?? Bell;
              const alarm = e.attributes?.alarm as string | undefined;
              const at = Date.parse(e.eventTime);
              return (
                <li key={e.id} className="flex items-center gap-3 py-3">
                  <span className="size-10 rounded-full grid place-items-center shrink-0 bg-white" style={{ color: c, boxShadow: `inset 0 0 0 2px ${c}55` }}><I size={18} /></span>
                  <Link href={`/devices/${e.deviceId}`} className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{names.get(e.deviceId) ?? e.deviceId}</div>
                    <div className="text-xs text-muted truncate">{evLabel(t, e.type)}{alarm ? ` (${alarmLabel(t, alarm)})` : ""}{e.geofenceId ? ` · ${fenceName.get(e.geofenceId) ?? ""}` : ""}</div>
                  </Link>
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-[11px] text-muted tabular-nums" dir="ltr">{Number.isFinite(at) ? stamp(at) : "—"}</span>
                    <i className={`size-2.5 rounded-full ${isUnread(e.eventTime, seenAt) ? "bg-amber-500" : "bg-transparent"}`} />
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <Empty />}
      </div>

      <div className="hidden md:flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("nav.events")}</h1>
          <p className="text-xs text-muted">{t("ev.subtitle")}</p>
        </div>
        <RangeBar value={range} custom={custom} onPreset={setRange} onCustom={setCustom} win={r} />
      </div>

      <div className="hidden md:block space-y-4">
      <Card id="e.filters" title={t("common.filters")}>
        <div className="flex flex-wrap gap-2 items-center">
          <select className="input !w-auto" value={dev} onChange={(e) => setDev(+e.target.value)}>
            <option value={0}>{t("common.allvehicles")}</option>
            {(devices ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button className={`btn ${type === "all" ? "btn-on" : ""}`} onClick={() => setType("all")}>{t("state.all")} {data?.length ?? 0}</button>
          {EVENT_TYPES.filter((x) => counts.has(x)).map((x) => (
            <button key={x} className={`btn ${type === x ? "btn-on" : ""}`} onClick={() => setType(x)}>
              <i className="size-2 rounded-full" style={{ background: EVENT_COLOR[x] ?? "#64748b" }} />{evLabel(t, x)} {counts.get(x)}
            </button>
          ))}
        </div>
      </Card>

      <Card id="e.list" title={`${t("nav.events")} (${rows.length})`} collapsible={false}>
        {isLoading ? <Skeleton className="h-60" /> : rows.length ? (
          <ul className="divide-y divide-line max-h-[65vh] overflow-y-auto">
            {rows.slice(0, 500).map((e) => {
              const c = EVENT_COLOR[e.type] ?? "#64748b";
              const alarm = e.attributes?.alarm as string | undefined;
              return (
                <li key={e.id} className="py-2.5 flex items-center gap-3 text-sm">
                  <span className="size-8 rounded-lg grid place-items-center shrink-0" style={{ background: c + "22", color: c }}><Bell size={15} /></span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">
                      <Link href={`/devices/${e.deviceId}`} className="font-medium hover:text-accent">{names.get(e.deviceId) ?? e.deviceId}</Link>
                      <span className="text-muted"> · {evLabel(t, e.type)}{alarm ? ` (${alarmLabel(t, alarm)})` : ""}{e.geofenceId ? ` · ${fenceName.get(e.geofenceId) ?? ""}` : ""}</span>
                    </div>
                  </div>
                  <div className="text-end text-xs text-muted shrink-0"><div>{fmtDateTime(e.eventTime)}</div><div>{timeAgo(e.eventTime)}</div></div>
                </li>
              );
            })}
          </ul>
        ) : <Empty />}
      </Card>
      </div>
    </div>
  );
}
