"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { en, ar, type Key } from "./dict";
import { setLocale } from "./format";

export type Lang = "ar" | "en";
const dicts = { en, ar } as const;

interface Ctx { lang: Lang; dir: "rtl" | "ltr"; t: (k: Key, v?: Record<string, string | number>) => string; setLang: (l: Lang) => void }
const I18n = createContext<Ctx | null>(null);

export function I18nProvider({ initial, children }: { initial: Lang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initial);
  setLocale(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB");
  const dir = lang === "ar" ? "rtl" : "ltr";

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
  }, [lang, dir]);

  const setLang = useCallback((l: Lang) => {
    document.cookie = `lang=${l};path=/;max-age=31536000;samesite=lax`;
    setLangState(l);
  }, []);

  const t = useCallback((k: Key, v?: Record<string, string | number>) => {
    let s: string = dicts[lang][k] ?? en[k] ?? k;
    if (v) for (const [a, b] of Object.entries(v)) s = s.replace(`{${a}}`, String(b));
    return s;
  }, [lang]);

  const value = useMemo(() => ({ lang, dir, t, setLang } as Ctx), [lang, dir, t, setLang]);
  return <I18n.Provider value={value}>{children}</I18n.Provider>;
}

export function useI18n() {
  const c = useContext(I18n);
  if (!c) throw new Error("I18nProvider missing");
  return c;
}
