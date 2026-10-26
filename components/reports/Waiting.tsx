"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Clock, MapPin, Truck } from "lucide-react";
import { fmtDateTime, fmtDuration } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { Card, Empty } from "@/components/ui";
import Place from "@/components/Place";
import { Pager, Th, useExport, usePaged, useSort, type RCtx } from "./shared";

const iso = (ms: number) => new Date(ms).toISOString();
const MERGE_M = 200; // stops closer than this are treated as the same place (loading yard, customer site…)

const dist = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 12742000 * Math.asin(Math.sqrt(h));
};

type Wait = { id: number; name: string; s: number; e: number; dur: number; lat: number; lon: number; ign: boolean; place: number };
type Group = { lat: number; lon: number; n: number; total: number; max: number; ign: number; vehicles: Set<string> };
type WK = "name" | "s" | "dur";
type GK = "total" | "n" | "avg" | "max";

/** Waiting report: how long each vehicle sat still (loading / unloading / queueing), engine on or off, and where. */
export default function Waiting({ ctx }: { ctx: RCtx }) {
  const { t } = useI18n();
  const [minMin, setMinMin] = useState(10);
  const [engine, setEngine] = useState<"all" | "on" | "off">("all");
  const [addr, setAddr] = useState(true);
  const wsort = useSort<WK>("dur");
  const gsort = useSort<GK>("total");

  const { waits, groups } = useMemo(() => {
    const raw = ctx.rows.flatMap((r) => Object.values(r.days).flatMap((d) => (d.stopList ?? []).map((x) => ({ ...x, id: r.id, name: r.name, dur: x.e - x.s }))))
      .filter((x) => x.dur >= minMin * 60000 && (engine === "all" || (engine === "on") === x.ign))
      .sort((a, b) => a.s - b.s);
    const gs: Group[] = [];
    const waits: Wait[] = raw.map((x) => {
      let i = gs.findIndex((g) => dist(g, x) <= MERGE_M);
      if (i < 0) { gs.push({ lat: x.lat, lon: x.lon, n: 0, total: 0, max: 0, ign: 0, vehicles: new Set() }); i = gs.length - 1; }
      const g = gs[i];
      g.lat = (g.lat * g.n + x.lat) / (g.n + 1); g.lon = (g.lon * g.n + x.lon) / (g.n + 1);
      g.n++; g.total += x.dur; g.max = Math.max(g.max, x.dur); if (x.ign) g.ign += x.dur; g.vehicles.add(x.name);
      return { ...x, place: i };
    });
    return { waits, groups: gs };
  }, [ctx.rows, minMin, engine]);

  const perVehicle = useMemo(() => {
    const m = new Map<number, { id: number; name: string; n: number; total: number; ign: number; max: number }>();
    waits.forEach((w) => {
      const v = m.get(w.id) ?? { id: w.id, name: w.name, n: 0, total: 0, ign: 0, max: 0 };
      v.n++; v.total += w.dur; v.max = Math.max(v.max, w.dur); if (w.ign) v.ign += w.dur;
      m.set(w.id, v);
    });
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [waits]);

  const waitRows = useMemo(() => [...waits].sort((a, b) => {
    const x = a[wsort.key], y = b[wsort.key];
    return (typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number)) * wsort.dir;
  }), [waits, wsort.key, wsort.dir]);
  const groupRows = useMemo(() => [...groups].sort((a, b) => {
    const f = (g: Group) => (gsort.key === "avg" ? g.total / g.n : g[gsort.key]);
    return (f(a) - f(b)) * gsort.dir;
  }), [groups, gsort.key, gsort.dir]);

  const exportRows = useMemo(() => waitRows.map((x) => ({
    [t("tbl.vehicle")]: x.name, [t("tbl.start")]: fmtDateTime(iso(x.s)), [t("tbl.end")]: fmtDateTime(iso(x.e)), [t("tbl.duration")]: fmtDuration(x.dur),
    [t("tbl.engine")]: x.ign ? t("common.on") : t("common.off"), [t("tbl.location")]: `${x.lat.toFixed(5)}, ${x.lon.toFixed(5)}`,
  })), [waitRows, t]);
  useExport(ctx, "waiting", exportRows);

  const wp = usePaged(waitRows, addr ? 25 : 60);
  const total = waits.reduce((s, x) => s + x.dur, 0);
  const totalIgn = waits.reduce((s, x) => s + (x.ign ? x.dur : 0), 0);

  return (
    <div className="space-y-4">
      <Card id="r.wait" title={t("tab.wait")} collapsible={false}
        right={
          <div className="flex flex-wrap items-center gap-2 text-xs no-print">
            <select className="input !w-auto !py-1 !text-xs" value={minMin} onChange={(e) => setMinMin(+e.target.value)} aria-label={t("rep.minstop")}>
              {[5, 10, 20, 30, 60, 120, 240].map((v) => <option key={v} value={v}>{t("rep.minstop")}: {v} {t("unit.min")}</option>)}
            </select>
            <select className="input !w-auto !py-1 !text-xs" value={engine} onChange={(e) => setEngine(e.target.value as typeof engine)} aria-label={t("tbl.engine")}>
              <option value="all">{t("tbl.engine")}: {t("state.all")}</option>
              <option value="on">{t("tbl.engine")}: {t("wait.on")}</option>
              <option value="off">{t("tbl.engine")}: {t("wait.off")}</option>
            </select>
            <button className={`btn !py-1 ${addr ? "btn-on" : ""}`} onClick={() => setAddr((v) => !v)}>{t("rep.addresses")}</button>
          </div>
        }>
        <p className="text-xs text-muted mb-3">{t("wait.hint")}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            [t("wait.count"), String(waits.length), Clock], [t("wait.total"), fmtDuration(total), Clock],
            [t("wait.engineon"), fmtDuration(totalIgn), Clock], [t("wait.places"), String(groups.length), MapPin],
          ].map(([label, v, I]) => {
            const Ic = I as typeof Clock;
            return <div key={label as string} className="bg-fg/[.05] rounded-xl p-3"><div className="flex items-center gap-1.5 text-[11px] text-muted"><Ic size={12} />{label as string}</div><div className="text-lg font-semibold mt-0.5 tabular-nums">{v as string}</div></div>;
          })}
        </div>
      </Card>

      <Card id="r.wait.places" title={`${t("wait.byplace")} (${groups.length})`} collapsible={false}>
        {groupRows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted"><tr>
                <Th>{t("tbl.location")}</Th><Th k="n" sort={gsort}>{t("wait.visits")}</Th><Th k="total" sort={gsort}>{t("wait.total")}</Th>
                <Th k="avg" sort={gsort}>{t("wait.avg")}</Th><Th k="max" sort={gsort}>{t("wait.longest")}</Th><Th>{t("wait.engineon")}</Th><Th>{t("nav.vehicles")}</Th>
              </tr></thead>
              <tbody>{groupRows.slice(0, 50).map((g, i) => (
                <tr key={i} className="border-t border-line hover:bg-fg/5 align-top">
                  <td className="py-2 pe-4 text-xs min-w-64"><MapPin size={12} className="inline me-1 text-accent" /><Place lat={g.lat} lon={g.lon} resolve={addr} /></td>
                  <td className="pe-4 tabular-nums">{g.n}</td>
                  <td className="pe-4 whitespace-nowrap font-medium">{fmtDuration(g.total)}</td>
                  <td className="pe-4 whitespace-nowrap">{fmtDuration(g.total / g.n)}</td>
                  <td className="pe-4 whitespace-nowrap">{fmtDuration(g.max)}</td>
                  <td className="pe-4 whitespace-nowrap text-orange-400">{g.ign ? fmtDuration(g.ign) : "—"}</td>
                  <td className="text-xs text-muted">{[...g.vehicles].slice(0, 4).join("، ")}{g.vehicles.size > 4 ? ` +${g.vehicles.size - 4}` : ""}</td>
                </tr>))}</tbody>
            </table>
          </div>
        ) : <Empty />}
      </Card>

      <Card id="r.wait.veh" title={t("wait.byvehicle")} collapsible={false}>
        {perVehicle.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted"><tr><Th>{t("tbl.vehicle")}</Th><Th>{t("wait.visits")}</Th><Th>{t("wait.total")}</Th><Th>{t("wait.longest")}</Th><Th>{t("wait.engineon")}</Th></tr></thead>
              <tbody>{perVehicle.map((v) => (
                <tr key={v.id} className="border-t border-line hover:bg-fg/5">
                  <td className="py-2 pe-4 whitespace-nowrap"><Truck size={13} className="inline me-1 text-muted" /><Link className="hover:text-accent font-medium" href={`/devices/${v.id}`}>{v.name}</Link></td>
                  <td className="pe-4 tabular-nums">{v.n}</td><td className="pe-4 whitespace-nowrap font-medium">{fmtDuration(v.total)}</td>
                  <td className="pe-4 whitespace-nowrap">{fmtDuration(v.max)}</td><td className="pe-4 whitespace-nowrap text-orange-400">{v.ign ? fmtDuration(v.ign) : "—"}</td>
                </tr>))}</tbody>
            </table>
          </div>
        ) : <Empty />}
      </Card>

      <Card id="r.wait.list" title={`${t("wait.details")} (${waits.length})`} collapsible={false}>
        {waitRows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted"><tr>
                <Th k="name" sort={wsort}>{t("tbl.vehicle")}</Th><Th k="s" sort={wsort}>{t("tbl.start")}</Th><Th>{t("tbl.end")}</Th>
                <Th k="dur" sort={wsort}>{t("tbl.duration")}</Th><Th>{t("tbl.engine")}</Th><Th>{t("tbl.location")}</Th>
              </tr></thead>
              <tbody>{wp.slice.map((x) => (
                <tr key={`${x.id}-${x.s}`} className="border-t border-line hover:bg-fg/5">
                  <td className="py-2 pe-4 whitespace-nowrap"><Link className="hover:text-accent font-medium" href={`/devices/${x.id}`}>{x.name}</Link></td>
                  <td className="pe-4 whitespace-nowrap">{fmtDateTime(iso(x.s))}</td><td className="pe-4 whitespace-nowrap">{fmtDateTime(iso(x.e))}</td>
                  <td className="pe-4 whitespace-nowrap font-medium">{fmtDuration(x.dur)}</td>
                  <td className="pe-4">{x.ign ? <span className="text-orange-400">{t("wait.on")}</span> : <span className="text-muted">{t("wait.off")}</span>}</td>
                  <td className="text-xs text-muted min-w-64"><Place lat={x.lat} lon={x.lon} resolve={addr} /></td>
                </tr>))}</tbody>
            </table>
            <Pager page={wp.page} pages={wp.pages} setPage={wp.setPage} />
          </div>
        ) : <Empty />}
      </Card>
    </div>
  );
}
