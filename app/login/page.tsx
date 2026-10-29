"use client";
import { useState, useSyncExternalStore } from "react";
import Brand from "@/components/Brand";
import { Loader2, Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n";

// false while the server-rendered page is not yet interactive (slow phone / dev build): pressing "sign in" before React is
// attached would submit the form as a plain GET and put the password in the address bar
const useHydrated = () => useSyncExternalStore(() => () => {}, () => true, () => false);

export default function Login() {
  const { t, lang, setLang } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const ready = useHydrated();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    // a full load (not router.replace): the preferences provider fetches this user's saved look once per page load, and it
    // could not before signing in
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    if (r.ok) { window.location.assign("/live"); return; }
    setErr(r.status === 401 ? t("login.invalid") : t("login.failed"));
    setBusy(false);
  }

  return (
    <main className="min-h-dvh grid place-items-center px-4 relative">
      <button onClick={() => setLang(lang === "ar" ? "en" : "ar")} className="btn glass absolute top-4 end-4"><Languages size={15} />{lang === "ar" ? "English" : "العربية"}</button>
      <form onSubmit={submit} className="glass w-full max-w-sm p-8 space-y-5 rise">
        <div className="flex flex-col items-center gap-2 text-center">
          <Brand variant="square" height={96} />
          <h1 className="sr-only">SAMA Logistics</h1>
          <p className="text-xs text-muted">{t("login.subtitle")}</p>
        </div>
        <div className="space-y-3">
          <input className="input" dir="ltr" type="email" placeholder={t("login.email")} autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input" dir="ltr" type="password" placeholder={t("login.password")} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {err && <p className="text-sm text-rose-400">{err}</p>}
        <button disabled={busy || !ready} className="w-full py-2.5 rounded-xl font-medium on-accent bg-gradient-to-r from-accent to-accent2 hover:opacity-90 flex justify-center">
          {busy ? <Loader2 className="animate-spin" size={20} /> : t("login.submit")}
        </button>
      </form>
    </main>
  );
}
