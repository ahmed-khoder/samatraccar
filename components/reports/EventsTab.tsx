"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useDevices, useGeofences, useReport } from "@/lib/api";
import { fmtDateTime } from "@/lib/format";
import { EVENT_COLOR, EVENT_TYPES, alarmLabel, evLabel } from "@/lib/events";
import { useI18n } from "@/lib/i18n";
import type { TEvent } from "@/lib/types";
import { Card, Empty, Skeleton } from "@/components/ui";
import { Pager, Th, useExport, usePaged, useSort, type RCtx } from "./shared";

type K = "time" | "name" | "type";

export default function EventsTab({ ctx }: { ctx: RCtx }) {
  const { t } = useI18n();
  const { data: devices } = useDevices();
  const { data: fences } = useGeofences();
  const ids = ctx.ids.length ? ctx.ids : undefined;
  const { data, isLoading } = useReport<TEvent[]>("events", ctx.win, ids);
  const [type, setType] = useState("all");
  const sort = useSort<K>("time");
  const names = useMemo(() => new Map((devices ?? []).map((d) => [d.id, d.name])), [devices]);
  const fenceName = useMemo(() => new Map((fences ?? []).map((f) => [f.id, f.name])), [fences]);
  const counts = useMemo(() => { const m = new Map<string, number>(); (data ?? []).forEach((e) => m.set(e.type, (m.get(e.type) ?? 0) + 1)); return m; }, [data]);
  const rows = useMemo(() => (data ?? []).filter((e) => type === "all" || e.type === type).map((e) => ({
    e, time: e.eventTime, name: names.get(e.deviceId) ?? String(e.deviceId), type: evLabel(t, e.type),
    detail: `${e.attributes?.alarm ? alarmLabel(t, String(e.attributes.alarm)) : ""}${e.geofenceId ? ` ${fenceName.get(e.geofenceId) ?? ""}` : ""}`.trim(),
  })).sort((a, b) => a[sort.key].localeCompare(b[sort.key]) * sort.dir), [data, type, names, fenceName, sort.key, sort.dir, t]);
  const exportRows = useMemo(() => rows.map((r) => ({ [t("tbl.vehicle")]: r.name, [t("tbl.type")]: r.type, [t("tbl.detail")]: r.detail, [t("tbl.time")]: fmtDateTime(r.time) })), [rows, t]);
  useExport(ctx, "events", exportRows);
  const pg = usePaged(rows, 60);

  return (
    <Card id="r.events" title={`${t("tab.events")} (${rows.length})`} collapsible={false}>
      <div className="flex flex-wrap gap-1.5 mb-3 no-print">
        <button className={`btn ${type === "all" ? "btn-on" : ""}`} onClick={() => setType("all")}>{t("state.all")} {data?.length ?? 0}</button>
        {EVENT_TYPES.filter((x) => counts.has(x)).map((x) => (
          <button key={x} className={`btn ${type === x ? "btn-on" : ""}`} onClick={() => setType(x)}><i className="size-2 rounded-full" style={{ background: EVENT_COLOR[x] ?? "#64748b" }} />{evLabel(t, x)} {counts.get(x)}</button>
        ))}
      </div>
      {isLoading ? <Skeleton className="h-48" /> : rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted"><tr><Th k="name" sort={sort}>{t("tbl.vehicle")}</Th><Th k="type" sort={sort}>{t("tbl.type")}</Th><Th>{t("tbl.detail")}</Th><Th k="time" sort={sort}>{t("tbl.time")}</Th></tr></thead>
            <tbody>{pg.slice.map((r) => (
              <tr key={r.e.id} className="border-t border-line hover:bg-fg/5">
                <td className="py-2 pe-4"><Link className="hover:text-accent font-medium" href={`/devices/${r.e.deviceId}`}>{r.name}</Link></td>
                <td className="pe-4"><span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: EVENT_COLOR[r.e.type] ?? "#64748b" }} />{r.type}</span></td>
                <td className="pe-4 text-muted">{r.detail}</td><td className="whitespace-nowrap">{fmtDateTime(r.time)}</td>
              </tr>))}</tbody>
          </table>
          <Pager page={pg.page} pages={pg.pages} setPage={pg.setPage} />
        </div>
      ) : <Empty />}
    </Card>
  );
}
