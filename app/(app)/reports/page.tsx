"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { useDevices, useReport } from "@/lib/api";
import { fmtDateTime, fmtDuration, fmtNum, knToKmh, mToKm, Range, rangeDates, toCsv } from "@/lib/format";
import type { Stop, Summary, TEvent, Trip } from "@/lib/types";
import { Card, Empty, RangePicker, Skeleton } from "@/components/ui";

type Kind = "trips" | "stops" | "summary" | "events";
type Row = Record<string, string | number>;

export default function Reports() {
  const { data: devices } = useDevices();
  const [kind, setKind] = useState<Kind>("trips");
  const [range, setRange] = useState<Range>("7d");
  const [dev, setDev] = useState<number>(0);
  const [custom, setCustom] = useState<{ from: string; to: string } | null>(null);
  const win = useMemo(() => custom ?? rangeDates(range), [range, custom]);
  const names = useMemo(() => new Map((devices ?? []).map((d) => [d.id, d.name])), [devices]);

  const { data, isLoading, error } = useReport<(Trip | Stop | Summary | TEvent)[]>(kind, win, dev || null);

  const rows: Row[] = useMemo(() => {
    const d = data ?? [];
    if (kind === "trips") return (d as Trip[]).map((t) => ({
      Vehicle: t.deviceName, Start: fmtDateTime(t.startTime), End: fmtDateTime(t.endTime), Duration: fmtDuration(t.duration),
      "Distance (km)": +mToKm(t.distance).toFixed(1), "Avg (km/h)": Math.round(knToKmh(t.averageSpeed)), "Max (km/h)": Math.round(knToKmh(t.maxSpeed)),
      From: t.startAddress ?? "", To: t.endAddress ?? "",
    }));
    if (kind === "stops") return (d as Stop[]).map((t) => ({
      Vehicle: t.deviceName, Start: fmtDateTime(t.startTime), End: fmtDateTime(t.endTime), Duration: fmtDuration(t.duration), Location: t.address ?? `${t.lat}, ${t.lon}`,
    }));
    if (kind === "summary") return (d as Summary[]).map((t) => ({
      Vehicle: t.deviceName, "Distance (km)": +mToKm(t.distance).toFixed(1), "Avg (km/h)": Math.round(knToKmh(t.averageSpeed)),
      "Max (km/h)": Math.round(knToKmh(t.maxSpeed)), "Engine hours": fmtDuration(t.engineHours),
    }));
    return (d as TEvent[]).map((t) => ({ Vehicle: names.get(t.deviceId) ?? t.deviceId, Type: t.type, Time: fmtDateTime(t.eventTime) }));
  }, [data, kind, names]);

  const cols = rows[0] ? Object.keys(rows[0]) : [];

  function exportCsv() {
    const url = URL.createObjectURL(new Blob(["﻿" + toCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${kind}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }
  const toLocal = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Reports</h1>
          <p className="text-xs text-muted">Trips, stops, summaries and events — export to CSV</p>
        </div>
        <button onClick={exportCsv} disabled={!rows.length} className="btn btn-on"><Download size={14} />Export CSV</button>
      </div>

      <Card title="Filters">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex gap-1.5">
            {(["trips", "stops", "summary", "events"] as Kind[]).map((k) => (
              <button key={k} onClick={() => setKind(k)} className={`btn capitalize ${kind === k ? "btn-on" : ""}`}>{k}</button>
            ))}
          </div>
          <select className="input !w-auto" value={dev} onChange={(e) => setDev(+e.target.value)}>
            <option value={0}>All vehicles</option>
            {(devices ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <RangePicker value={range} onChange={(r) => { setRange(r); setCustom(null); }} />
          <div className="flex gap-2 items-center text-xs text-muted">
            <input type="datetime-local" className="input !w-auto !py-1.5" value={toLocal(win.from)}
              onChange={(e) => e.target.value && setCustom({ from: new Date(e.target.value).toISOString(), to: win.to })} />
            →
            <input type="datetime-local" className="input !w-auto !py-1.5" value={toLocal(win.to)}
              onChange={(e) => e.target.value && setCustom({ from: win.from, to: new Date(e.target.value).toISOString() })} />
          </div>
        </div>
      </Card>

      <Card title={`${rows.length} result${rows.length === 1 ? "" : "s"}`}>
        {isLoading ? <Skeleton className="h-60" /> : error ? <Empty text="Failed to load report (range may be too large)" /> : rows.length ? (
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted text-left sticky top-0 bg-solid"><tr>{cols.map((c) => <th key={c} className="py-2 pr-4 font-medium whitespace-nowrap">{c}</th>)}</tr></thead>
              <tbody>{rows.map((r, i) => (
                <tr key={i} className="border-t border-line hover:bg-white/5">
                  {cols.map((c) => <td key={c} className={`py-2 pr-4 ${c === "From" || c === "To" || c === "Location" ? "text-xs text-muted min-w-48" : "whitespace-nowrap tabular-nums"}`}>
                    {c === "Vehicle" && devices ? <Link className="hover:text-accent" href={`/devices/${devices.find((d) => d.name === r[c])?.id ?? ""}`}>{r[c]}</Link> : r[c]}
                  </td>)}
                </tr>))}</tbody>
            </table>
          </div>
        ) : <Empty />}
      </Card>
    </div>
  );
}
