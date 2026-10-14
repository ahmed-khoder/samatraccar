"use client";
import { useMemo } from "react";
import Link from "next/link";
import { avgSpeed } from "@/lib/agg";
import { fmtDuration, fmtNum } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { Card, Empty } from "@/components/ui";
import { useExport, type RCtx } from "./shared";

export default function Daily({ ctx }: { ctx: RCtx }) {
  const { t, lang } = useI18n();
  const map = useMemo(() => new Map(ctx.perDay), [ctx.perDay]);
  const dayLabel = (d: string) => new Date(d + "T12:00:00").toLocaleDateString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { weekday: "short", day: "2-digit", month: "short" });
  const rows = ctx.days.map((d) => {
    const a = map.get(d);
    const active = ctx.rows.filter((r) => (r.days[d]?.dist ?? 0) > 1000).length;
    return { d, km: (a?.dist ?? 0) / 1000, trips: a?.trips ?? 0, moving: a?.movingMs ?? 0, idle: a?.idleMs ?? 0, avg: a ? avgSpeed(a) : 0, max: a?.maxSpeed ?? 0, over: a?.overCount ?? 0, active };
  });
  const maxCell = Math.max(1, ...ctx.rows.flatMap((r) => ctx.days.map((d) => (r.days[d]?.dist ?? 0) / 1000)));

  const exportRows = useMemo(() => rows.map((r) => ({
    [t("tbl.date")]: r.d, [t("tbl.distance")]: Math.round(r.km * 10) / 10, [t("tbl.trips")]: r.trips, [t("tbl.driving")]: fmtDuration(r.moving), [t("kpi.idle")]: fmtDuration(r.idle),
    [t("tbl.avg")]: Math.round(r.avg), [t("tbl.max")]: Math.round(r.max), [t("tbl.overspeed")]: r.over, [t("rep.activeveh")]: r.active,
  })), [rows, t]);
  useExport(ctx, "daily", exportRows);

  return (
    <div className="space-y-4">
      <Card id="r.daytbl" title={t("tab.daily")} collapsible={false}>
        {ctx.rows.length ? (
          <div className="overflow-auto max-h-[50vh]">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted sticky top-0 bg-solid"><tr>
                {(["tbl.date", "tbl.distance", "tbl.trips", "tbl.driving", "kpi.idle", "tbl.avg", "tbl.max", "tbl.overspeed", "rep.activeveh"] as const).map((h) => <th key={h} className="py-2 pe-4 font-medium text-start whitespace-nowrap">{t(h)}</th>)}
              </tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.d} className="border-t border-line hover:bg-fg/5">
                  <td className="py-2 pe-4 whitespace-nowrap">{dayLabel(r.d)}</td>
                  <td className="pe-4 tabular-nums">{fmtNum(r.km, 1)}</td><td className="pe-4 tabular-nums">{r.trips}</td>
                  <td className="pe-4 whitespace-nowrap">{fmtDuration(r.moving)}</td><td className="pe-4 whitespace-nowrap">{fmtDuration(r.idle)}</td>
                  <td className="pe-4 tabular-nums">{fmtNum(r.avg)}</td><td className="pe-4 tabular-nums">{fmtNum(r.max)}</td>
                  <td className="pe-4 tabular-nums">{r.over}</td><td className="tabular-nums">{r.active}</td>
                </tr>))}</tbody>
            </table>
          </div>
        ) : <Empty />}
      </Card>

      <Card id="r.heat" title={t("rep.heatmap")}>
        <p className="text-xs text-muted mb-2">{t("rep.heathint")}</p>
        <div className="overflow-auto max-h-[60vh]">
          <table className="text-[11px] border-separate border-spacing-0.5">
            <thead className="sticky top-0 bg-solid z-10"><tr><th className="text-start pe-3 font-medium text-muted">{t("tbl.vehicle")}</th>{ctx.days.map((d) => <th key={d} className="font-normal text-muted px-0.5 min-w-9" dir="ltr">{d.slice(8)}</th>)}</tr></thead>
            <tbody>
              {ctx.rows.map((r) => (
                <tr key={r.id}>
                  <td className="pe-3 whitespace-nowrap"><Link href={`/devices/${r.id}`} className="hover:text-accent">{r.name}</Link></td>
                  {ctx.days.map((d) => {
                    const km = (r.days[d]?.dist ?? 0) / 1000;
                    const a = km ? 0.12 + 0.88 * Math.min(1, km / maxCell) : 0;
                    return <td key={d} title={`${r.name} · ${d}: ${fmtNum(km, 1)} ${t("unit.km")}`} className="text-center rounded h-7 tabular-nums"
                      style={{ background: km ? `color-mix(in srgb, var(--accent) ${Math.round(a * 100)}%, transparent)` : "color-mix(in srgb, var(--fg) 4%, transparent)", color: a > 0.6 ? "var(--on-accent)" : "var(--fg)" }}>{km >= 1 ? Math.round(km) : ""}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
