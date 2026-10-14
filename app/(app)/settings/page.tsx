"use client";
import { useRouter } from "next/navigation";
import { Moon, Sun, MonitorCog, LogOut, RotateCcw } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { usePrefs, type Prefs } from "@/lib/prefs";
import { Card } from "@/components/ui";
import type { Key } from "@/lib/dict";

function Seg<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { v: T; label: string; icon?: React.ReactNode }[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} className={`btn ${value === o.v ? "btn-on" : ""}`} aria-pressed={value === o.v}>{o.icon}{o.label}</button>
      ))}
    </div>
  );
}

/** Tiny wireframe showing where a bar/panel sits. Uses logical sides so it mirrors in RTL like the real UI. */
function Wire({ at, on, label, onClick }: { at: "start" | "end" | "top" | "bottom"; on: boolean; label: string; onClick: () => void }) {
  const strip =
    at === "start" ? "inset-y-0 start-0 w-3" : at === "end" ? "inset-y-0 end-0 w-3" : at === "top" ? "inset-x-0 top-0 h-2.5" : "inset-x-0 bottom-0 h-2.5";
  return (
    <button onClick={onClick} aria-pressed={on} className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border transition ${on ? "btn-on" : "border-line hover:bg-fg/5"}`}>
      <span className="relative w-16 h-11 rounded-md border border-line bg-fg/[.06] overflow-hidden">
        <i className={`absolute rounded-sm bg-accent ${strip}`} />
      </span>
      <span className="text-[11px]">{label}</span>
    </button>
  );
}

const Row = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <div className="grid md:grid-cols-[220px_1fr] gap-2 md:gap-6 py-3 border-t border-line first:border-t-0 first:pt-0">
    <div><div className="text-sm font-medium">{title}</div>{hint && <div className="text-xs text-muted mt-0.5">{hint}</div>}</div>
    <div>{children}</div>
  </div>
);

export default function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const { prefs, set, reset } = usePrefs();
  const router = useRouter();
  const sideLabel = (v: "start" | "end" | "top" | "bottom"): string => t(`pos.${v}` as Key);
  const yesno = (k: "trails" | "labels") => (
    <Seg value={prefs[k] ? "on" : "off"} onChange={(v) => set({ [k]: v === "on" } as Partial<Prefs>)}
      options={[{ v: "on", label: t("common.on") }, { v: "off", label: t("common.off") }]} />
  );

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div>
          <h1 className="text-xl font-semibold">{t("nav.settings")}</h1>
          <p className="text-xs text-muted">{t("set.subtitle")}</p>
        </div>

        <Card id="s.look" title={t("set.appearance")} collapsible={false}>
          <Row title={t("set.theme")} hint={t("set.themehint")}>
            <Seg value={prefs.theme} onChange={(v) => set({ theme: v })} options={[
              { v: "dark", label: t("theme.dark"), icon: <Moon size={14} /> },
              { v: "light", label: t("theme.light"), icon: <Sun size={14} /> },
              { v: "system", label: t("theme.system"), icon: <MonitorCog size={14} /> },
            ]} />
          </Row>
          <Row title={t("nav.language")}>
            <Seg value={lang} onChange={setLang} options={[{ v: "ar", label: "العربية" }, { v: "en", label: "English" }]} />
          </Row>
        </Card>

        <Card id="s.layout" title={t("set.layout")} collapsible={false}>
          <Row title={t("set.navpos")} hint={t("set.navhint")}>
            <div className="flex flex-wrap gap-2">
              {(["start", "end", "top", "bottom"] as const).map((p) => <Wire key={p} at={p} on={prefs.nav === p} label={sideLabel(p)} onClick={() => set({ nav: p })} />)}
            </div>
          </Row>
          {(prefs.nav === "start" || prefs.nav === "end") && (
            <Row title={t("set.navmode")} hint={t("set.modehint")}>
              <Seg value={prefs.navMode} onChange={(v) => set({ navMode: v })} options={[{ v: "hover", label: t("mode.hover") }, { v: "fixed", label: t("mode.fixed") }]} />
            </Row>
          )}
          <Row title={t("set.listpos")} hint={t("set.listhint")}>
            <div className="flex flex-wrap gap-2">
              {(["start", "end", "bottom"] as const).map((p) => <Wire key={p} at={p} on={prefs.list === p} label={sideLabel(p)} onClick={() => set({ list: p })} />)}
            </div>
          </Row>
          <Row title={t("set.listmode")}>
            <Seg value={prefs.listMode} onChange={(v) => set({ listMode: v })} options={[{ v: "hover", label: t("mode.hover") }, { v: "fixed", label: t("mode.fixed") }]} />
          </Row>
          <p className="text-[11px] text-muted pt-2 border-t border-line">{t("set.phonenote")}</p>
        </Card>

        <Card id="s.map" title={t("set.map")} collapsible={false}>
          <Row title={t("set.tile")}>
            <Seg value={prefs.tile} onChange={(v) => set({ tile: v })} options={[
              { v: "auto", label: t("map.auto") }, { v: "dark", label: t("map.dark") }, { v: "light", label: t("map.light") },
              { v: "sat", label: t("map.sat") }, { v: "topo", label: t("map.topo") },
            ]} />
          </Row>
          <Row title={t("map.trails")}>{yesno("trails")}</Row>
          <Row title={t("map.labels")}>{yesno("labels")}</Row>
        </Card>

        <Card id="s.geo" title={t("set.addresses")} collapsible={false}>
          <Row title={t("set.geo")} hint={t("set.geohint")}>
            <Seg value={prefs.geo} onChange={(v) => set({ geo: v })} options={[
              { v: "server", label: t("geo.server") }, { v: "osm", label: t("geo.osm") }, { v: "off", label: t("geo.off") },
            ]} />
          </Row>
        </Card>

        <Card id="s.an" title={t("set.analytics")} collapsible={false}>
          <Row title={t("set.limit")} hint={t("set.limithint")}>
            <div className="flex items-center gap-3 max-w-md" dir="ltr">
              <input type="range" min={30} max={160} step={5} value={prefs.limit} onChange={(e) => set({ limit: +e.target.value })} className="flex-1 accent-cyan-500" />
              <span className="tabular-nums w-20 text-sm">{prefs.limit} {t("unit.kmh")}</span>
            </div>
          </Row>
        </Card>

        <div className="flex flex-wrap gap-2 pb-6">
          <button className="btn" onClick={() => reset()}><RotateCcw size={14} />{t("set.reset")}</button>
          <button className="btn" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/login"); }}><LogOut size={14} className="rtl:rotate-180" />{t("nav.logout")}</button>
        </div>
      </div>
    </div>
  );
}
