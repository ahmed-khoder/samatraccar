"use client";
import { useMemo } from "react";
import Link from "next/link";
import { fmtDuration, fmtNum } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { Card, Delta, Empty } from "@/components/ui";
import { useExport, useSort, Th, type RCtx } from "./shared";
import type { VRow } from "@/lib/report-utils";
import type { Key } from "@/lib/dict";

type K = "name" | "km" | "trips" | "moving" | "idle" | "idlePct" | "stops" | "avg" | "max" | "over" | "harsh" | "score" | "activeDays" | "kmPerActive";
const COLS: { k: K; label: Key; good?: "up" | "down" }[] = [
  { k: "km", label: "tbl.distance", good: "up" }, { k: "trips", label: "tbl.trips" }, { k: "moving", label: "tbl.driving" }, { k: "idle", label: "kpi.idle", good: "down" },
  { k: "idlePct", label: "tbl.idlepct", good: "down" }, { k: "stops", label: "tab.stops" }, { k: "avg", label: "tbl.avg" }, { k: "max", label: "tbl.max" },
  { k: "over", label: "tbl.overspeed", good: "down" }, { k: "harsh", label: "tbl.harsh", good: "down" }, { k: "score", label: "tbl.score", good: "up" },
  { k: "activeDays", label: "tbl.activedays" }, { k: "kmPerActive", label: "tbl.kmday" },
];

const cell = (r: Pick<VRow, K>, k: K) => {
  switch (k) {
    case "km": case "kmPerActive": return fmtNum(r[k] as number, 1);
    case "moving": case "idle": return fmtDuration(r[k] as number);
    case "idlePct": return `${fmtNum(r.idlePct)}%`;
    case "avg": case "max": return fmtNum(r[k] as number);
    default: return String(r[k]);
  }
};

export default function Summary({ ctx }: { ctx: RCtx }) {
  const { t } = useI18n();
  const sort = useSort<K>("km");
  const prev = useMemo(() => new Map((ctx.prevRows ?? []).map((r) => [r.id, r])), [ctx.prevRows]);
  const rows = useMemo(() => [...ctx.rows].sort((a, b) => {
    const x = a[sort.key], y = b[sort.key];
    return (typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number)) * sort.dir;
  }), [ctx.rows, sort.key, sort.dir]);

  const exportRows = useMemo(() => rows.map((r) => ({
    [t("tbl.vehicle")]: r.name, ...Object.fromEntries(COLS.map((c) => [t(c.label), ["moving", "idle"].includes(c.k) ? fmtDuration(r[c.k] as number) : Math.round((r[c.k] as number) * 10) / 10])),
  })), [rows, t]);
  useExport(ctx, "summary", exportRows);

  const T = ctx.tot;
  const totalRow: Pick<VRow, K> = { name: t("rep.total"), km: T.km, trips: T.trips, moving: T.moving, idle: T.idle, idlePct: T.idlePct, stops: T.stops, avg: T.avg, max: T.max, over: T.over, harsh: T.harsh, score: T.score, activeDays: 0, kmPerActive: 0 };

  return (
    <Card id="r.summary" title={t("tab.summary")} collapsible={false}>
      {rows.length ? (
        <div className="overflow-auto max-h-[68vh]">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted sticky top-0 bg-solid z-10">
              <tr><Th k="name" sort={sort}>{t("tbl.vehicle")}</Th>{COLS.map((c) => <Th key={c.k} k={c.k} sort={sort}>{t(c.label)}</Th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pv = prev.get(r.id);
                return (
                  <tr key={r.id} className="border-t border-line hover:bg-fg/5">
                    <td className="py-2 pe-4 whitespace-nowrap"><Link className="hover:text-accent font-medium" href={`/devices/${r.id}`}>{r.name}</Link></td>
                    {COLS.map((c) => (
                      <td key={c.k} className="pe-4 whitespace-nowrap tabular-nums">
                        {cell(r, c.k)}
                        {pv && ["km", "trips", "moving", "idle", "avg", "over", "harsh", "score"].includes(c.k) && <span className="ms-1.5"><Delta cur={r[c.k] as number} prev={pv[c.k] as number} good={c.good ?? "up"} /></span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="sticky bottom-0 bg-solid font-semibold">
              <tr className="border-t-2 border-line">
                <td className="py-2 pe-4">{t("rep.total")}</td>
                {COLS.map((c) => <td key={c.k} className="pe-4 tabular-nums whitespace-nowrap">{["activeDays", "kmPerActive"].includes(c.k) ? "" : cell(totalRow, c.k)}</td>)}
              </tr>
            </tfoot>
          </table>
        </div>
      ) : <Empty />}
    </Card>
  );
}
