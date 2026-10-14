"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { useDevices, useGeofences, useReport } from "@/lib/api";
import { fmtDateTime, timeAgo } from "@/lib/format";
import { useRangeSel } from "@/lib/hooks";
import { EVENT_COLOR, EVENT_TYPES, alarmLabel, evLabel } from "@/lib/events";
import { useI18n } from "@/lib/i18n";
import type { TEvent } from "@/lib/types";
import { Card, Empty, RangeBar, Skeleton } from "@/components/ui";

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
  const counts = useMemo(() => { const m = new Map<string, number>(); (data ?? []).forEach((e) => m.set(e.type, (m.get(e.type) ?? 0) + 1)); return m; }, [data]);

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("nav.events")}</h1>
          <p className="text-xs text-muted">{t("ev.subtitle")}</p>
        </div>
        <RangeBar value={range} custom={custom} onPreset={setRange} onCustom={setCustom} win={r} />
      </div>

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
  );
}
