"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Map, LayoutDashboard, FileBarChart, LogOut, Truck, Bell, Pin, PinOff, Languages, Settings, Sun, Moon, MonitorCog, Ellipsis } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
import Brand from "@/components/Brand";
import type { Key } from "@/lib/dict";

const NAV: { href: string; label: Key; icon: typeof Map }[] = [
  { href: "/live", label: "nav.live", icon: Map },
  { href: "/dashboard", label: "nav.analytics", icon: LayoutDashboard },
  { href: "/devices", label: "nav.vehicles", icon: Truck },
  { href: "/events", label: "nav.events", icon: Bell },
  { href: "/reports", label: "nav.reports", icon: FileBarChart },
  { href: "/settings", label: "nav.settings", icon: Settings },
];

const SHORT: Record<string, Key> = { "/live": "navs.live", "/events": "navs.events", "/analytics": "nav.analytics" };
// phones: four main tabs + a "More" sheet (alerts, settings, theme, language, sign out), which the desktop header normally holds
const TABS = ["/live", "/devices", "/dashboard", "/reports"];
const MORE = ["/events", "/settings"];
const THEME_NEXT = { dark: "light", light: "system", system: "dark" } as const;

export default function Shell({ children, user }: { children: React.ReactNode; user: string }) {
  const path = usePathname();
  const router = useRouter();
  const { t, lang, setLang } = useI18n();
  const { prefs, set } = usePrefs();
  const { nav } = prefs;
  const vertical = nav === "start" || nav === "end";
  const fixed = prefs.navMode === "fixed";
  const [hover, setHover] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const expanded = fixed || hover;
  const enter = () => { window.clearTimeout(timer.current); setHover(true); };
  const leave = () => { timer.current = window.setTimeout(() => setHover(false), 250); };

  // the sheet belongs to the page it was opened on, so navigating closes it without an effect
  const [openOn, setOpenOn] = useState<string | null>(null);
  const sheet = openOn === path;
  const setSheet = (v: boolean | ((x: boolean) => boolean)) => setOpenOn((cur) => ((typeof v === "function" ? v(cur === path) : v) ? path : null));
  useEffect(() => {
    if (!sheet) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && setSheet(false);
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [sheet]); // eslint-disable-line react-hooks/exhaustive-deps

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }
  const ThemeIcon = prefs.theme === "dark" ? Moon : prefs.theme === "light" ? Sun : MonitorCog;
  const cycleTheme = () => set({ theme: THEME_NEXT[prefs.theme] });
  const PinIcon = fixed ? PinOff : Pin;
  const row = "flex items-center gap-3 px-[0.8rem] py-2.5 rounded-xl text-sm text-muted hover:bg-fg/5 hover:text-fg whitespace-nowrap";
  const lab = `transition-opacity duration-150 ${expanded ? "opacity-100" : "opacity-0"}`;

  // flex order is logical (follows writing direction), so a plain row + order-first/last puts the rail on the start/end side
  const flow = vertical ? "md:flex-row" : "md:flex-col";
  const barOrder = nav === "top" ? "md:order-first" : "md:order-last";

  return (
    <div className={`h-dvh flex flex-col ${flow}`}>
      {/* vertical rail (start / end): compact, floats open on hover */}
      {vertical && (
        <div className={`hidden md:block shrink-0 relative transition-[width] duration-200 ${nav === "end" ? "order-last" : "order-first"} ${fixed ? "w-56" : "w-[60px]"}`}>
          <aside onMouseEnter={enter} onMouseLeave={leave}
            className={`absolute inset-y-0 ${nav === "start" ? "start-0 border-e" : "end-0 border-s"} z-[1500] flex flex-col border-line bg-solid/95 backdrop-blur p-2 overflow-hidden transition-[width,box-shadow] duration-200 ease-out ${expanded ? "w-56" : "w-[60px]"} ${hover && !fixed ? "shadow-2xl" : ""}`}
            style={hover && !fixed ? { boxShadow: "0 20px 50px var(--shadow)" } : undefined}>
            <div className="flex items-center px-[0.35rem] py-3 mb-2 h-14">
              {expanded ? <Brand variant="line" height={34} /> : <Brand variant="icon" height={36} />}
            </div>
            <nav className="space-y-1 flex-1 overflow-y-auto overflow-x-hidden">
              {NAV.map(({ href, label, icon: Icon }) => {
                const on = path.startsWith(href);
                return (
                  <Link key={href} href={href} title={t(label)}
                    className={`flex items-center gap-3 px-[0.8rem] py-2.5 rounded-xl text-sm transition whitespace-nowrap ${on ? "btn-on text-fg border" : "text-muted hover:bg-fg/5 hover:text-fg"}`}>
                    <Icon size={19} className="shrink-0" /><span className={lab}>{t(label)}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="px-2 text-[11px] text-muted truncate mb-1" dir="ltr">{expanded ? user : ""}</div>
            <button onClick={cycleTheme} title={t("set.theme")} className={row}><ThemeIcon size={19} className="shrink-0" /><span className={lab}>{t(`theme.${prefs.theme}` as Key)}</span></button>
            <button onClick={() => setLang(lang === "ar" ? "en" : "ar")} title={t("nav.language")} className={row}>
              <Languages size={19} className="shrink-0" /><span className={lab}>{lang === "ar" ? "English" : "العربية"}</span>
            </button>
            <button onClick={logout} title={t("nav.logout")} className={`${row} hover:!text-rose-400`}>
              <LogOut size={19} className="shrink-0 rtl:rotate-180" /><span className={lab}>{t("nav.logout")}</span>
            </button>
            <button onClick={() => set({ navMode: fixed ? "hover" : "fixed" })} title={t("nav.pin")} className={`${row} ${fixed ? "!text-accent" : ""}`}>
              <PinIcon size={19} className="shrink-0" /><span className={lab}>{t("nav.pin")}</span>
            </button>
          </aside>
        </div>
      )}

      <main className="flex-1 min-h-0 min-w-0 overflow-hidden relative">{children}</main>

      {/* horizontal bar (top / bottom) for desktop */}
      {!vertical && (
        <header className={`hidden md:flex items-center gap-1 px-3 h-14 shrink-0 bg-solid/90 backdrop-blur border-line ${nav === "top" ? "border-b" : "border-t"} ${barOrder}`}>
          <div className="flex items-center pe-3">
            <Brand variant="icon" height={32} className="xl:hidden" />
            <Brand variant="line" height={30} className="hidden xl:block" />
          </div>
          <nav className="flex gap-1 flex-1 overflow-x-auto">
            {NAV.map(({ href, label, icon: Icon }) => {
              const on = path.startsWith(href);
              return (
                <Link key={href} href={href} title={t(label)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm whitespace-nowrap ${on ? "btn-on text-fg border" : "text-muted hover:bg-fg/5 hover:text-fg"}`}>
                  <Icon size={18} /><span className="hidden lg:block">{t(label)}</span>
                </Link>
              );
            })}
          </nav>
          <span className="text-[11px] text-muted hidden xl:block px-2" dir="ltr">{user}</span>
          <button onClick={cycleTheme} title={t("set.theme")} className="btn !p-2"><ThemeIcon size={16} /></button>
          <button onClick={() => setLang(lang === "ar" ? "en" : "ar")} title={t("nav.language")} className="btn !p-2"><Languages size={16} /></button>
          <button onClick={logout} title={t("nav.logout")} className="btn !p-2"><LogOut size={16} className="rtl:rotate-180" /></button>
        </header>
      )}

      {/* phones: floating tab bar + "More" sheet */}
      {sheet && <div className="md:hidden fixed inset-0 z-[2000] bg-black/45 backdrop-blur-[2px] fade-in" onClick={() => setSheet(false)} />}
      {sheet && (
        <div role="dialog" aria-label={t("nav.more")} className="md:hidden sheet-up fixed inset-x-0 bottom-0 z-[2001] rounded-t-3xl border-t border-line bg-solid px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]"
          style={{ boxShadow: "0 -16px 50px var(--shadow)" }}>
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-fg/20" />
          <div className="grid grid-cols-2 gap-2">
            {MORE.map((href) => {
              const it = NAV.find((n) => n.href === href)!; const Icon = it.icon; const on = path.startsWith(href);
              return (
                <Link key={href} href={href} className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-sm ${on ? "btn-on text-fg" : "border-line text-fg"}`}>
                  <Icon size={20} className={on ? "text-accent" : "text-muted"} />{t(it.label)}
                </Link>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <button onClick={cycleTheme} className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3.5 text-sm"><ThemeIcon size={20} className="text-muted" />{t(`theme.${prefs.theme}` as Key)}</button>
            <button onClick={() => setLang(lang === "ar" ? "en" : "ar")} className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3.5 text-sm"><Languages size={20} className="text-muted" />{lang === "ar" ? "English" : "العربية"}</button>
          </div>
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-line">
            <span className="flex-1 min-w-0 truncate text-xs text-muted" dir="ltr">{user}</span>
            <button onClick={logout} className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-rose-400 active:bg-rose-500/10"><LogOut size={18} className="rtl:rotate-180" />{t("nav.logout")}</button>
          </div>
        </div>
      )}
      <nav className="md:hidden order-last relative z-[1900] px-3 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-gradient-to-t from-bg via-bg/80 to-transparent pointer-events-none">
        <div className="pointer-events-auto flex items-stretch gap-1 rounded-[22px] border border-line bg-solid/90 backdrop-blur-xl p-1" style={{ boxShadow: "0 8px 28px var(--shadow)" }}>
          {[...TABS, "more"].map((href) => {
            const more = href === "more";
            const it = more ? null : NAV.find((n) => n.href === href)!;
            const Icon = more ? Ellipsis : it!.icon;
            const on = more ? sheet || MORE.some((m) => path.startsWith(m)) : path.startsWith(href) && !sheet;
            const cls = `flex-1 min-w-0 flex flex-col items-center justify-center gap-0.5 rounded-2xl py-1.5 text-[10.5px] font-medium transition active:scale-95 ${on ? "bg-accent/15 text-accent" : "text-muted"}`;
            const inner = (<><Icon size={21} strokeWidth={on ? 2.3 : 1.9} /><span className="truncate max-w-full px-0.5">{more ? t("nav.more") : t(SHORT[href] ?? it!.label)}</span></>);
            return more
              ? <button key={href} onClick={() => setSheet((v) => !v)} aria-expanded={sheet} className={cls}>{inner}</button>
              : <Link key={href} href={href} className={cls} aria-current={on ? "page" : undefined}>{inner}</Link>;
          })}
        </div>
      </nav>
    </div>
  );
}
