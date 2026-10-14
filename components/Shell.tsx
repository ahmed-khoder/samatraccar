"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Map, LayoutDashboard, FileBarChart, LogOut, Radar, Truck, Bell, Pin, PinOff, Languages, Settings, Sun, Moon, MonitorCog } from "lucide-react";
import { useI18n } from "@/lib/i18n";
import { usePrefs } from "@/lib/prefs";
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
            <div className="flex items-center gap-3 px-[0.35rem] py-3 mb-2">
              <div className="size-9 shrink-0 rounded-xl grid place-items-center bg-gradient-to-br from-accent to-accent2">
                <Radar size={20} className="on-accent" />
              </div>
              <span className={`font-semibold grad-text text-lg ${lab}`}>Tracar</span>
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
          <div className="flex items-center gap-2.5 pe-3">
            <div className="size-8 rounded-lg grid place-items-center bg-gradient-to-br from-accent to-accent2"><Radar size={17} className="on-accent" /></div>
            <span className="font-semibold grad-text hidden xl:block">Tracar</span>
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

      {/* phones: always a bottom tab bar */}
      <nav className="md:hidden order-last flex border-t border-line bg-solid/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        {NAV.map(({ href, label, icon: Icon }) => {
          const on = path.startsWith(href);
          return (
            <Link key={href} href={href} className={`flex-1 min-w-0 flex flex-col items-center gap-0.5 py-2 text-[10px] ${on ? "text-accent" : "text-muted"}`}>
              <Icon size={20} /><span className="truncate max-w-full px-0.5">{t(SHORT[href] ?? label)}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
