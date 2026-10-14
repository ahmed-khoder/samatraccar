"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Map, LayoutDashboard, FileBarChart, LogOut, Radar } from "lucide-react";

const NAV = [
  { href: "/live", label: "Live Map", icon: Map },
  { href: "/dashboard", label: "Analytics", icon: LayoutDashboard },
  { href: "/reports", label: "Reports", icon: FileBarChart },
];

export default function Shell({ children, user }: { children: React.ReactNode; user: string }) {
  const path = usePathname();
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }
  return (
    <div className="h-dvh flex flex-col md:flex-row">
      <aside className="hidden md:flex w-[72px] lg:w-56 shrink-0 flex-col border-r border-line bg-solid/60 backdrop-blur p-3">
        <div className="flex items-center gap-3 px-2 py-3 mb-4">
          <div className="size-9 shrink-0 rounded-xl grid place-items-center bg-gradient-to-br from-accent to-accent2">
            <Radar size={20} className="text-slate-950" />
          </div>
          <span className="hidden lg:block font-semibold grad-text text-lg">Tracar</span>
        </div>
        <nav className="space-y-1 flex-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const on = path.startsWith(href);
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition ${on ? "btn-on text-white border" : "text-muted hover:bg-white/5 hover:text-fg"}`}>
                <Icon size={19} /><span className="hidden lg:block">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-2 text-xs text-muted truncate hidden lg:block mb-2">{user}</div>
        <button onClick={logout} className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-muted hover:bg-white/5 hover:text-rose-400">
          <LogOut size={19} /><span className="hidden lg:block">Sign out</span>
        </button>
      </aside>

      <main className="flex-1 min-h-0 min-w-0 overflow-hidden relative">{children}</main>

      <nav className="md:hidden flex border-t border-line bg-solid/90 backdrop-blur">
        {NAV.map(({ href, label, icon: Icon }) => {
          const on = path.startsWith(href);
          return (
            <Link key={href} href={href} className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] ${on ? "text-accent" : "text-muted"}`}>
              <Icon size={20} />{label}
            </Link>
          );
        })}
        <button onClick={logout} className="flex-1 flex flex-col items-center gap-0.5 py-2 text-[11px] text-muted">
          <LogOut size={20} />Exit
        </button>
      </nav>
    </div>
  );
}
