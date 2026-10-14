"use client";
import { useMemo } from "react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDuration, fmtNum } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { Card, chartTip, Empty } from "@/components/ui";
import { useExport, useSort, Th, type RCtx } from "./shared";
import type { VRow } from "@/lib/report-utils";

const AX = { stroke: "#8a99b3", fontSize: 11, tickLine: false, axisLine: false } as const;
type K = "name" | "score" | "km" | "over" | "overPct" | "harshBrake" | "harshAccel" | "max";
type R = VRow & { overPct: number; harshBrake: number; harshAccel: number };

export default function Behavior({ ctx }: { ctx: RCtx }) {
  const { t } = useI18n();
  const sort = useSort<K>("score", 1);
  const base: R[] = useMemo(() => ctx.rows.filter((r) => r.km > 1).map((r) => ({ ...r, overPct: r.a.movingMs ? (r.a.overMs / r.a.movingMs) * 100 : 0, harshBrake: r.a.harshBrake, harshAccel: r.a.harshAccel })), [ctx.rows]);
  const rows = useMemo(() => [...base].sort((a, b) => {
    const x = a[sort.key], y = b[sort.key];
    return (typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number)) * sort.dir;
  }), [base, sort.key, sort.dir]);
  const exportRows = useMemo(() => rows.map((r) => ({
    [t("tbl.vehicle")]: r.name, [t("tbl.score")]: r.score, [t("tbl.distance")]: Math.round(r.km * 10) / 10, [t("tbl.overspeed")]: r.over,
    [t("tbl.overtime")]: fmtDuration(r.overMs), [t("tbl.overpct")]: Math.round(r.overPct * 10) / 10, [t("rep.brake")]: r.harshBrake, [t("rep.accel")]: r.harshAccel, [t("tbl.max")]: Math.round(r.max),
  })), [rows, t]);
  useExport(ctx, "behavior", exportRows);
  const scoreCol = (s: number) => (s > 80 ? "#34d399" : s > 60 ? "#fbbf24" : "#f43f5e");
  const chart = [...base].sort((a, b) => b.score - a.score);

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <Card id="b.score" title={t("chart.scores")}>
          {chart.length ? (
            <ResponsiveContainer width="100%" height={Math.max(180, chart.length * 30)}>
              <BarChart data={chart.map((r) => ({ name: r.name, score: r.score }))} layout="vertical">
                <CartesianGrid stroke="rgba(148,163,184,.22)" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} {...AX} /><YAxis type="category" dataKey="name" {...AX} width={70} orientation="left" />
                <Tooltip {...chartTip} />
                <Bar dataKey="score" radius={[0, 6, 6, 0]}>{chart.map((r, i) => <Cell key={i} fill={scoreCol(r.score)} />)}</Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
          <p className="text-[11px] text-muted mt-2">{t("rep.scorehint", { n: ctx.limit })}</p>
        </Card>
        <Card id="b.events" title={t("rep.risk")}>
          {chart.length ? (
            <ResponsiveContainer width="100%" height={Math.max(180, chart.length * 30)}>
              <BarChart data={chart.map((r) => ({ name: r.name, over: r.over, brake: r.harshBrake, accel: r.harshAccel }))} layout="vertical">
                <CartesianGrid stroke="rgba(148,163,184,.22)" horizontal={false} />
                <XAxis type="number" {...AX} /><YAxis type="category" dataKey="name" {...AX} width={70} orientation="left" />
                <Tooltip {...chartTip} /><Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="over" name={t("tbl.overspeed")} stackId="a" fill="#f43f5e" />
                <Bar dataKey="brake" name={t("rep.brake")} stackId="a" fill="#fb923c" />
                <Bar dataKey="accel" name={t("rep.accel")} stackId="a" fill="#fbbf24" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <Empty />}
        </Card>
      </div>
      <Card id="b.table" title={t("tab.behavior")} collapsible={false}>
        {rows.length ? (
          <div className="overflow-auto max-h-[55vh]">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted sticky top-0 bg-solid"><tr>
                <Th k="name" sort={sort}>{t("tbl.vehicle")}</Th><Th k="score" sort={sort}>{t("tbl.score")}</Th><Th k="km" sort={sort}>{t("tbl.distance")}</Th>
                <Th k="over" sort={sort}>{t("tbl.overspeed")}</Th><Th k="overPct" sort={sort}>{t("tbl.overpct")}</Th><Th k="harshBrake" sort={sort}>{t("rep.brake")}</Th><Th k="harshAccel" sort={sort}>{t("rep.accel")}</Th><Th k="max" sort={sort}>{t("tbl.max")}</Th>
              </tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id} className="border-t border-line hover:bg-fg/5">
                  <td className="py-2 pe-4"><Link className="hover:text-accent font-medium" href={`/devices/${r.id}`}>{r.name}</Link></td>
                  <td className="pe-4"><span className="px-2 py-0.5 rounded-lg text-xs font-medium tabular-nums" style={{ background: scoreCol(r.score) + "26", color: scoreCol(r.score) }}>{r.score}</span></td>
                  <td className="pe-4 tabular-nums">{fmtNum(r.km, 1)}</td><td className="pe-4 tabular-nums">{r.over}</td>
                  <td className="pe-4 tabular-nums">{fmtNum(r.overPct, 1)}%</td><td className="pe-4 tabular-nums">{r.harshBrake}</td><td className="pe-4 tabular-nums">{r.harshAccel}</td><td className="tabular-nums">{fmtNum(r.max)}</td>
                </tr>))}</tbody>
            </table>
          </div>
        ) : <Empty />}
      </Card>
    </div>
  );
}
