"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Barcode, Copy, History, Navigation, Palette, Phone, Route, X } from "lucide-react";
import { fmtDateTime, fmtNum, knToKmh } from "@/lib/format";
import { mapsDirections } from "@/lib/fleet";
import { infoAttr } from "@/lib/vinfo";
import { vehState } from "@/lib/vstate";
import { iconOf } from "@/lib/vehicle";
import { usePrefs } from "@/lib/prefs";
import { useI18n } from "@/lib/i18n";
import type { Key } from "@/lib/dict";
import type { Device, Position } from "@/lib/types";

/** Copies text; plain-http pages (the phone on the LAN) have no clipboard API, so fall back to a hidden textarea. */
export function copy(text: string) {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true, () => false);
  const ta = Object.assign(document.createElement("textarea"), { value: text, readOnly: true });
  ta.style.cssText = "position:fixed;opacity:0";
  document.body.append(ta); ta.select();
  let ok = false; try { ok = document.execCommand("copy"); } catch {}
  ta.remove();
  return Promise.resolve(ok);
}

function Row({ t, copied, onCopy, k, v, ltr, copyable, href }: {
  t: (k: Key) => string; copied: string; onCopy: (k: Key, v: string) => void; k: Key; v: string; ltr?: boolean; copyable?: boolean; href?: string;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 text-sm">
      <span className="shrink-0 text-muted">{t(k)}</span>
      <span className="min-w-0 flex-1 text-end truncate" dir={ltr ? "ltr" : undefined}>
        {v ? (href ? <a href={href} className="text-accent" target={href.startsWith("http") ? "_blank" : undefined} rel="noopener">{v}</a> : v) : "—"}
      </span>
      {copyable && v && (
        <button className="p-1 -m-1 text-muted" aria-label={t("info.copy")} onClick={() => onCopy(k, v)}>
          {copied === k ? <span className="text-[11px] text-accent">{t("info.copied")}</span> : <Copy size={15} />}
        </button>
      )}
    </div>
  );
}

/** Everything known about one vehicle, laid out like the iTrack app's device page: registration first, then its live state. */
export default function VehicleInfo({ device: d, position: p, onClose, onEdit }: { device: Device; position?: Position; onClose: () => void; onEdit: () => void }) {
  const { t } = useI18n();
  const { prefs } = usePrefs();
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [copied, setCopied] = useState("");
  useEffect(() => { setHost(document.body); }, []);
  if (!host) return null;

  const { vs, color } = vehState(prefs, d, p);
  const I = iconOf(d.category);
  const a = p?.attributes ?? {};
  const live = d.status === "online";
  const kmh = Math.round(knToKmh(p?.speed));

  const onCopy = (k: Key, v: string) => copy(v).then((ok) => { setCopied(ok ? k : ""); setTimeout(() => setCopied(""), 1500); });
  const row = { t, copied, onCopy };
  const group = "rounded-2xl border border-line bg-fg/[.03] divide-y divide-line overflow-hidden";
  const coords = p ? `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}` : "";

  return createPortal(
    <div className="fixed inset-0 z-[3000] bg-black/55 grid items-end md:place-items-center" onClick={onClose}>
      <div role="dialog" aria-modal aria-label={t("info.title")} onClick={(e) => e.stopPropagation()}
        className="sheet-up w-full md:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-3xl md:rounded-3xl bg-solid border-t md:border border-line p-4 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-3">
        <div className="flex items-center gap-3">
          <span className="size-12 rounded-full grid place-items-center shrink-0" style={{ background: color + "22", color }}><I size={26} /></span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold truncate">{d.name}{d.model && <span className="text-accent text-sm font-normal"> ({d.model})</span>}</div>
            <div className="text-xs" style={{ color }}>{t(`state.${vs}` as Key)}</div>
          </div>
          <button onClick={onClose} className="btn !p-1.5" aria-label={t("common.close")}><X size={14} /></button>
        </div>

        <div className="grid grid-cols-4 gap-2 text-[11px]">
          <Link href={`/playback/${d.id}`} className="flex flex-col items-center gap-1 rounded-2xl border-2 border-blue-500/60 bg-blue-500/5 py-2.5 text-center"><Route size={20} className="text-blue-600" />{t("pb.open")}</Link>
          <Link href={`/devices/${d.id}`} className="flex flex-col items-center gap-1 rounded-2xl border border-line py-2.5 text-center"><History size={20} className="text-orange-500" />{t("veh.details")}</Link>
          {p ? <a href={mapsDirections(p.latitude, p.longitude)} target="_blank" rel="noopener" className="flex flex-col items-center gap-1 rounded-2xl border border-line py-2.5"><Navigation size={20} className="text-violet-600" />{t("fleet.navigate")}</a> : <span />}
          <button onClick={onEdit} className="flex flex-col items-center gap-1 rounded-2xl border border-line py-2.5"><Palette size={20} className="text-slate-500" />{t("info.edit")}</button>
        </div>

        {/* the two numbers the office asks for most: large, one tap to copy, the SIM one tap to call */}
        <div className="grid gap-2">
          {([["info.imei", d.uniqueId, Barcode], ["info.sim", d.phone ?? "", Phone]] as const).map(([k, v, Ic]) => (
            <div key={k} className="rounded-2xl border-2 border-accent/40 bg-accent/5 px-4 py-3">
              <div className="flex items-center gap-1.5 text-xs text-muted"><Ic size={14} />{t(k)}</div>
              <div className="flex items-center gap-2 pt-1">
                <span className="min-w-0 flex-1 text-xl font-semibold tabular-nums tracking-wide truncate" dir="ltr">{v || "—"}</span>
                {v && k === "info.sim" && <a href={`tel:${v}`} className="btn !p-2" aria-label={t("info.call")}><Phone size={18} /></a>}
                {v && (
                  <button className="btn !p-2 min-w-10 justify-center" aria-label={t("info.copy")} onClick={() => onCopy(k, v)}>
                    {copied === k ? <span className="text-[11px] text-accent">{t("info.copied")}</span> : <Copy size={18} />}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className={group}>
          <Row {...row} k="info.name" v={d.name} />
          <Row {...row} k="info.iccid" v={infoAttr(d, "iccid")} ltr copyable />
          <Row {...row} k="info.model" v={d.model ?? ""} ltr />
        </div>

        <div className={group}>
          <Row {...row} k="info.status" v={live ? t("fleet.online") : t("fleet.offline")} />
          <Row {...row} k="info.updated" v={fmtDateTime(d.lastUpdate)} ltr />
          <Row {...row} k="info.fix" v={p ? fmtDateTime(p.fixTime) : ""} ltr />
          <Row {...row} k="info.speed" v={p ? `${fmtNum(kmh)} ${t("unit.kmh")}` : ""} />
          <Row {...row} k="info.coords" v={coords} ltr copyable href={p ? `https://www.google.com/maps?q=${coords}` : undefined} />
          <Row {...row} k="info.engine" v={typeof a.ignition === "boolean" ? t(a.ignition ? "fleet.engon" : "fleet.engoff") : ""} />
        </div>
      </div>
    </div>,
    host,
  );
}
