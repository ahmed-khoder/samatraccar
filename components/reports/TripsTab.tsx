"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronsRight, ParkingCircle } from "lucide-react";
import { fmtDateTime, fmtDuration, fmtNum, mToKm } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { Card, Empty } from "@/components/ui";
import Place from "@/components/Place";
import { Pager, Th, useExport, usePaged, useSort, type RCtx } from "./shared";

const iso = (ms: number) => new Date(ms).toISOString();
type TK = "name" | "s" | "dur" | "dist" | "avg" | "max";
type SK = "name" | "s" | "dur";

export default function TripsTab({ ctx, kind }: { ctx: RCtx; kind: "trips" | "stops" }) {
  const { t } = useI18n();
  const [addr, setAddr] = useState(true);
  const [minKm, setMinKm] = useState(0);
  const [minMin, setMinMin] = useState(3);
  const tsort = useSort<TK>("s");
  const ssort = useSort<SK>("s");

  const trips = useMemo(() => ctx.rows.flatMap((r) => Object.values(r.days).flatMap((d) => (d.tripList ?? []).map((x) => ({ ...x, id: r.id, name: r.name, dur: x.e - x.s })))), [ctx.rows]);
  const stops = useMemo(() => ctx.rows.flatMap((r) => Object.values(r.days).flatMap((d) => (d.stopList ?? []).map((x) => ({ ...x, id: r.id, name: r.name, dur: x.e - x.s })))), [ctx.rows]);

  const tripRows = useMemo(() => trips.filter((x) => x.dist / 1000 >= minKm).sort((a, b) => {
    const x = a[tsort.key], y = b[tsort.key];
    return (typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number)) * tsort.dir;
  }), [trips, minKm, tsort.key, tsort.dir]);
  const stopRows = useMemo(() => stops.filter((x) => x.dur >= minMin * 60000).sort((a, b) => {
    const x = a[ssort.key], y = b[ssort.key];
    return (typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number)) * ssort.dir;
  }), [stops, minMin, ssort.key, ssort.dir]);

  const exportRows = useMemo(() => (kind === "trips"
    ? tripRows.map((x) => ({
      [t("tbl.vehicle")]: x.name, [t("tbl.start")]: fmtDateTime(iso(x.s)), [t("tbl.end")]: fmtDateTime(iso(x.e)), [t("tbl.duration")]: fmtDuration(x.dur),
      [t("tbl.distance")]: Math.round(mToKm(x.dist) * 10) / 10, [t("tbl.avg")]: Math.round(x.avg), [t("tbl.max")]: Math.round(x.max),
      [t("tbl.from")]: `${x.sLat.toFixed(5)}, ${x.sLon.toFixed(5)}`, [t("tbl.to")]: `${x.eLat.toFixed(5)}, ${x.eLon.toFixed(5)}`,
    }))
    : stopRows.map((x) => ({
      [t("tbl.vehicle")]: x.name, [t("tbl.start")]: fmtDateTime(iso(x.s)), [t("tbl.end")]: fmtDateTime(iso(x.e)), [t("tbl.duration")]: fmtDuration(x.dur),
      [t("tbl.engine")]: x.ign ? t("common.on") : t("common.off"), [t("tbl.location")]: `${x.lat.toFixed(5)}, ${x.lon.toFixed(5)}`,
    }))), [kind, tripRows, stopRows, t]);
  useExport(ctx, kind, exportRows);

  const size = addr ? 25 : 60;
  const tp = usePaged(tripRows, size);
  const sp = usePaged(stopRows, size);

  const totalKm = tripRows.reduce((s, x) => s + x.dist, 0) / 1000;
  const totalDur = (kind === "trips" ? tripRows : stopRows).reduce((s, x) => s + x.dur, 0);

  return (
    <Card id={`r.${kind}`} title={`${t(kind === "trips" ? "tab.trips" : "tab.stops")} (${kind === "trips" ? tripRows.length : stopRows.length})`} collapsible={false}
      right={
        <div className="flex flex-wrap items-center gap-2 text-xs no-print">
          {kind === "trips" ? (
            <select className="input !w-auto !py-1 !text-xs" value={minKm} onChange={(e) => setMinKm(+e.target.value)} aria-label={t("rep.minkm")}>
              {[0, 1, 5, 20, 50].map((v) => <option key={v} value={v}>{t("rep.minkm")}: {v}</option>)}
            </select>
          ) : (
            <select className="input !w-auto !py-1 !text-xs" value={minMin} onChange={(e) => setMinMin(+e.target.value)} aria-label={t("rep.minstop")}>
              {[3, 10, 30, 60, 180].map((v) => <option key={v} value={v}>{t("rep.minstop")}: {v} {t("unit.min")}</option>)}
            </select>
          )}
          <button className={`btn !py-1 ${addr ? "btn-on" : ""}`} onClick={() => setAddr((v) => !v)}>{t("rep.addresses")}</button>
        </div>
      }>
      <p className="text-xs text-muted mb-3">
        {kind === "trips" ? t("rep.tripsum", { km: fmtNum(totalKm), d: fmtDuration(totalDur) }) : t("rep.stopsum", { d: fmtDuration(totalDur) })}
      </p>
      {kind === "trips" ? (tripRows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted"><tr>
              <Th k="name" sort={tsort}>{t("tbl.vehicle")}</Th><Th k="s" sort={tsort}>{t("tbl.start")}</Th><Th>{t("tbl.end")}</Th><Th k="dur" sort={tsort}>{t("tbl.duration")}</Th>
              <Th k="dist" sort={tsort}>{t("tbl.distance")}</Th><Th k="avg" sort={tsort}>{t("tbl.avg")}</Th><Th k="max" sort={tsort}>{t("tbl.max")}</Th><Th>{t("tbl.route")}</Th>
            </tr></thead>
            <tbody>{tp.slice.map((x) => (
              <tr key={`${x.id}-${x.s}`} className="border-t border-line hover:bg-fg/5">
                <td className="py-2 pe-4 whitespace-nowrap"><Link className="hover:text-accent font-medium" href={`/devices/${x.id}?trip=${x.s}`}>{x.name}</Link></td>
                <td className="pe-4 whitespace-nowrap">{fmtDateTime(iso(x.s))}</td><td className="pe-4 whitespace-nowrap">{fmtDateTime(iso(x.e))}</td>
                <td className="pe-4 whitespace-nowrap">{fmtDuration(x.dur)}</td><td className="pe-4 tabular-nums">{fmtNum(mToKm(x.dist), 1)}</td>
                <td className="pe-4 tabular-nums">{fmtNum(x.avg)}</td><td className="pe-4 tabular-nums">{fmtNum(x.max)}</td>
                <td className="text-xs text-muted min-w-72"><Place lat={x.sLat} lon={x.sLon} resolve={addr} /> <ChevronsRight size={12} className="inline rtl:rotate-180" /> <Place lat={x.eLat} lon={x.eLon} resolve={addr} /></td>
              </tr>))}</tbody>
          </table>
          <Pager page={tp.page} pages={tp.pages} setPage={tp.setPage} />
        </div>
      ) : <Empty />) : (stopRows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted"><tr>
              <Th k="name" sort={ssort}>{t("tbl.vehicle")}</Th><Th k="s" sort={ssort}>{t("tbl.start")}</Th><Th>{t("tbl.end")}</Th><Th k="dur" sort={ssort}>{t("tbl.duration")}</Th><Th>{t("tbl.engine")}</Th><Th>{t("tbl.location")}</Th>
            </tr></thead>
            <tbody>{sp.slice.map((x) => (
              <tr key={`${x.id}-${x.s}`} className="border-t border-line hover:bg-fg/5">
                <td className="py-2 pe-4 whitespace-nowrap"><Link className="hover:text-accent font-medium" href={`/devices/${x.id}`}>{x.name}</Link></td>
                <td className="pe-4 whitespace-nowrap">{fmtDateTime(iso(x.s))}</td><td className="pe-4 whitespace-nowrap">{fmtDateTime(iso(x.e))}</td>
                <td className="pe-4 whitespace-nowrap"><ParkingCircle size={13} className="inline me-1 text-amber-400" />{fmtDuration(x.dur)}</td>
                <td className="pe-4">{x.ign ? <span className="text-orange-400">{t("kpi.idle")}</span> : <span className="text-muted">{t("common.off")}</span>}</td>
                <td className="text-xs text-muted min-w-64"><Place lat={x.lat} lon={x.lon} resolve={addr} /></td>
              </tr>))}</tbody>
          </table>
          <Pager page={sp.page} pages={sp.pages} setPage={sp.setPage} />
        </div>
      ) : <Empty />)}
    </Card>
  );
}
