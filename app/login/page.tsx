"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Radar, Loader2, Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export default function Login() {
  const router = useRouter();
  const { t, lang, setLang } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (r.ok) { router.replace("/live"); router.refresh(); return; }
    setErr(r.status === 401 ? t("login.invalid") : t("login.failed"));
    setBusy(false);
  }

  return (
    <main className="min-h-screen grid place-items-center px-4 relative">
      <button onClick={() => setLang(lang === "ar" ? "en" : "ar")} className="btn glass absolute top-4 end-4"><Languages size={15} />{lang === "ar" ? "English" : "العربية"}</button>
      <form onSubmit={submit} className="glass w-full max-w-sm p-8 space-y-5 rise">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl grid place-items-center bg-gradient-to-br from-accent to-accent2">
            <Radar className="on-accent" />
          </div>
          <div>
            <h1 className="text-xl font-semibold grad-text">Tracar</h1>
            <p className="text-xs text-muted">{t("login.subtitle")}</p>
          </div>
        </div>
        <div className="space-y-3">
          <input className="input" dir="ltr" type="email" placeholder={t("login.email")} autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input" dir="ltr" type="password" placeholder={t("login.password")} autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {err && <p className="text-sm text-rose-400">{err}</p>}
        <button disabled={busy} className="w-full py-2.5 rounded-xl font-medium on-accent bg-gradient-to-r from-accent to-accent2 hover:opacity-90 flex justify-center">
          {busy ? <Loader2 className="animate-spin" size={20} /> : t("login.submit")}
        </button>
      </form>
    </main>
  );
}
