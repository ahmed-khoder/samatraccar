"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Radar, Loader2 } from "lucide-react";

export default function Login() {
  const router = useRouter();
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
    setErr((await r.json().catch(() => null))?.error || "Login failed");
    setBusy(false);
  }

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <form onSubmit={submit} className="glass w-full max-w-sm p-8 space-y-5">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-xl grid place-items-center bg-gradient-to-br from-accent to-accent2">
            <Radar className="text-slate-950" />
          </div>
          <div>
            <h1 className="text-xl font-semibold grad-text">Tracar</h1>
            <p className="text-xs text-muted">Fleet intelligence platform</p>
          </div>
        </div>
        <div className="space-y-3">
          <input className="input" type="email" placeholder="Email" autoComplete="username" required
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="input" type="password" placeholder="Password" autoComplete="current-password" required
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {err && <p className="text-sm text-rose-400">{err}</p>}
        <button disabled={busy} className="w-full py-2.5 rounded-xl font-medium text-slate-950 bg-gradient-to-r from-accent to-accent2 hover:opacity-90 flex justify-center">
          {busy ? <Loader2 className="animate-spin" size={20} /> : "Sign in"}
        </button>
      </form>
    </main>
  );
}
