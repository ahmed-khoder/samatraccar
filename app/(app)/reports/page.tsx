"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import { Download, Printer, GitCompare, Loader2 } from "lucide-react";
import { useAnalyticsRange, useDevices } from "@/lib/api";
import { fmtDateTime, prevRange, toCsv } from "@/lib/format";
import { useRangeSel, usePersisted } from "@/lib/hooks";
import { dayKeys, totals, vehicleRows } from "@/lib/report-utils";
import { useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import { Card, RangeBar, VehiclePicker } from "@/components/ui";
import type { RCtx } from "@/components/reports/shared";
import Overview from "@/components/reports/Overview";
import Summary from "@/components/reports/Summary";
import Daily from "@/components/reports/Daily";
import TripsTab from "@/components/reports/TripsTab";
import Waiting from "@/components/reports/Waiting";
import Behavior from "@/components/reports/Behavior";
import Compare from "@/components/reports/Compare";
import EventsTab from "@/components/reports/EventsTab";
import type { Key } from "@/lib/dict";

const TABS = ["overview", "summary", "daily", "trips", "stops", "wait", "behavior", "compare", "events"] as const;
type Tab = (typeof TABS)[number];

export default function Reports() {
  const { t } = useI18n();
  const { prefs } = usePrefs();
  const { data: devices } = useDevices();
  const [tab, setTab] = usePersisted<Tab>("rep.tab", "overview");
  const [selected, setSelected] = usePersisted<number[]>("rep.ids", []);
  const [cmp, setCmp] = useState(false);
  const { range, setRange, custom, setCustom, win } = useRangeSel("7d");
  const prevWin = useMemo(() => prevRange(win), [win]);

  const ids = useMemo(() => {
    const valid = selected.filter((i) => devices?.some((d) => d.id === i));
    return valid.length && valid.length < (devices?.length ?? 0) ? valid : [];
  }, [selected, devices]);

  const idList = ids.length ? ids : undefined;
  const live = new Date(win.to).getTime() > Date.now() - 36e5;
  const an = useAnalyticsRange(win, idList, undefined, live ? 60000 : 0);
  const needPrev = cmp || tab === "compare";
  const pan = useAnalyticsRange(needPrev ? prevWin : null, idList);

  const rows = useMemo(() => vehicleRows(an.data, ids), [an.data, ids]);
  const prevRows = useMemo(() => (needPrev && pan.data ? vehicleRows(pan.data, ids) : null), [needPrev, pan.data, ids]);
  const tot = useMemo(() => totals(rows), [rows]);
  const prevTot = useMemo(() => (prevRows ? totals(prevRows) : null), [prevRows]);

  const exp = useRef<{ name: string; rows: Record<string, string | number>[] }>({ name: "report", rows: [] });
  const [expCount, setExpCount] = useState(0);
  const setExport = useCallback((name: string, r: Record<string, string | number>[]) => { exp.current = { name, rows: r }; setExpCount(r.length); }, []);

  const ctx: RCtx = {
    rows, prevRows, perDay: an.perDay, prevPerDay: prevRows ? pan.perDay : null, tot, prevTot, days: dayKeys(win), win,
    devices: devices ?? [], ids, loading: an.loading, limit: prefs.limit, setExport,
  };

  function exportCsv() {
    const { name, rows: r } = exp.current;
    const url = URL.createObjectURL(new Blob(["﻿" + toCsv(r)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const pct = an.progress.total ? Math.round((an.progress.done / an.progress.total) * 100) : 0;
  const scope = ids.length ? t("rep.nvehicles", { n: ids.length }) : t("common.allvehicles");

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6 space-y-4 print-scroll">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t("nav.reports")}</h1>
          <p className="text-xs text-muted">{t("rep.subtitle")}</p>
        </div>
        <div className="flex gap-2 no-print">
          <button onClick={() => window.print()} className="btn"><Printer size={14} />{t("rep.print")}</button>
          <button onClick={exportCsv} disabled={!expCount} className="btn btn-on"><Download size={14} />{t("rep.export")}</button>
        </div>
      </div>

      <Card id="r.filters" title={t("common.filters")} className="no-print">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted w-20">{t("tbl.vehicle")}</span>
            <VehiclePicker devices={devices ?? []} value={ids.length ? ids : (devices ?? []).map((d) => d.id)} onChange={(v) => setSelected(v)} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted w-20">{t("rep.period")}</span>
            <RangeBar value={range} custom={custom} onPreset={setRange} onCustom={setCustom} win={win} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted w-20">{t("tab.compare")}</span>
            <button className={`btn ${cmp ? "btn-on" : ""}`} onClick={() => setCmp((v) => !v)}><GitCompare size={14} />{t("rep.vsprev")}</button>
            {cmp && <span className="text-xs text-muted">{fmtDateTime(prevWin.from)} → {fmtDateTime(prevWin.to)}</span>}
          </div>
        </div>
      </Card>

      {/* print header */}
      <div className="hidden print:block text-sm">
        <strong>{t(`tab.${tab}` as Key)}</strong> · {scope} · {fmtDateTime(win.from)} → {fmtDateTime(win.to)}
      </div>

      <div className="flex flex-wrap gap-1.5 no-print">
        {TABS.map((k) => <button key={k} onClick={() => setTab(k)} className={`btn ${tab === k ? "btn-on" : ""}`}>{t(`tab.${k}` as Key)}</button>)}
      </div>

      {an.loading && (
        <div className="glass p-3 flex items-center gap-3 text-xs text-muted no-print">
          <Loader2 size={14} className="animate-spin text-accent" />{t("rep.loading")} {pct}%
          <div className="flex-1 h-1.5 rounded bg-fg/10 overflow-hidden"><div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div>
        </div>
      )}
      {an.error && <div className="glass p-3 text-xs text-rose-400">{t("rep.partial")}</div>}

      {tab === "overview" && <Overview ctx={ctx} />}
      {tab === "summary" && <Summary ctx={ctx} />}
      {tab === "daily" && <Daily ctx={ctx} />}
      {tab === "trips" && <TripsTab ctx={ctx} kind="trips" />}
      {tab === "stops" && <TripsTab ctx={ctx} kind="stops" />}
      {tab === "wait" && <Waiting ctx={ctx} />}
      {tab === "behavior" && <Behavior ctx={ctx} />}
      {tab === "compare" && <Compare ctx={ctx} />}
      {tab === "events" && <EventsTab ctx={ctx} />}
    </div>
  );
}
