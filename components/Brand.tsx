"use client";
/* eslint-disable @next/next/no-img-element */
import { usePrefs } from "@/lib/prefs";

const DIR = "/brand/sama_logistics_";
const ASSET = {
  icon: { light: "icon.svg", dark: "icon_transparent_white_text.png", ratio: 1 },
  line: { light: "one_line_logo.svg", dark: "one_line_logo_transparent_white_text.png", ratio: 1920 / 584.7 },
  square: { light: "square_logo.svg", dark: "square_logo_transparent_white_text.png", ratio: 1920 / 1629.7 },
} as const;

/** Official SAMA Logistics logo: coloured SVG on light backgrounds, the all-white version on dark ones. Sized by height, never stretched. */
export default function Brand({ variant, height, className = "" }: { variant: keyof typeof ASSET; height: number; className?: string }) {
  const { resolvedTheme } = usePrefs();
  const a = ASSET[variant];
  return <img src={DIR + (resolvedTheme === "dark" ? a.dark : a.light)} alt="SAMA Logistics" height={height} width={Math.round(height * a.ratio)} style={{ height, width: "auto" }} className={`shrink-0 select-none ${className}`} draggable={false} />;
}
