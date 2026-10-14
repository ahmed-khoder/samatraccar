"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Loader2, X } from "lucide-react";
import type { Device } from "@/lib/types";
import { updateDevice } from "@/lib/api";
import { CATEGORIES, COLORS, deviceColor } from "@/lib/vehicle";
import { useI18n } from "@/lib/i18n";
import type { Key } from "@/lib/dict";

export default function DeviceEditor({ device, onClose }: { device: Device; onClose: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(device.name);
  const [cat, setCat] = useState(device.category || "default");
  const [color, setColor] = useState<string | null>(deviceColor(device));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => { setHost(document.body); }, []);

  async function save() {
    setBusy(true); setErr("");
    try {
      await updateDevice(device.id, (d) => {
        const attributes = { ...d.attributes };
        if (color) attributes.tracarColor = color; else delete attributes.tracarColor;
        return { ...d, name: name.trim() || d.name, category: cat === "default" ? null : cat, attributes };
      });
      onClose();
    } catch { setErr(t("edit.error")); setBusy(false); }
  }

  if (!host) return null;
  // portal: ancestors with transform/backdrop-filter would otherwise trap a position:fixed modal
  return createPortal(
    <div className="fixed inset-0 z-[3000] grid place-items-center p-4 bg-black/55 backdrop-blur-sm" onClick={onClose}>
      <div className="glass !bg-solid w-full max-w-lg p-5 space-y-4 max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">{t("edit.title")}</h2>
          <button onClick={onClose} className="btn !p-1.5" aria-label={t("common.close")}><X size={14} /></button>
        </div>

        <label className="block text-xs text-muted space-y-1.5">{t("edit.name")}
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>

        <div>
          <p className="text-xs text-muted mb-2">{t("edit.type")}</p>
          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
            {CATEGORIES.map(({ key, icon: I }) => (
              <button key={key} onClick={() => setCat(key)} title={t(`cat.${key}` as Key)}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-[10px] transition ${cat === key ? "btn-on" : "border-line hover:bg-fg/5"}`}>
                <I size={22} style={{ color: color ?? "#22d3ee" }} />
                <span className="truncate max-w-full">{t(`cat.${key}` as Key)}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-muted mb-2">{t("edit.color")}</p>
          <div className="flex flex-wrap gap-2 items-center">
            <button onClick={() => setColor(null)} className={`btn !py-1 ${!color ? "btn-on" : ""}`}>{t("edit.auto")}</button>
            {COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} aria-label={c}
                className={`size-7 rounded-full border-2 grid place-items-center ${color === c ? "border-white" : "border-transparent"}`} style={{ background: c }}>
                {color === c && <Check size={14} className="on-accent" />}
              </button>
            ))}
          </div>
        </div>

        {err && <p className="text-sm text-rose-400">{err}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn btn-on" onClick={save} disabled={busy}>{busy && <Loader2 size={14} className="animate-spin" />}{t("common.save")}</button>
        </div>
      </div>
    </div>,
    host,
  );
}
