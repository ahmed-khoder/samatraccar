import type { Device, Position } from "./types";
import type { Prefs } from "./prefs-shared";
import { deviceState, knToKmh, visualState, type VisualState } from "./format";
import { deviceColor } from "./vehicle";

type ColorPrefs = Pick<Prefs, "colorMode" | "cMoving" | "cIdle" | "cStopped" | "cOver" | "cOffline" | "limit">;

export const paletteOf = (p: ColorPrefs): Record<VisualState, string> =>
  ({ over: p.cOver, moving: p.cMoving, idle: p.cIdle, stopped: p.cStopped, offline: p.cOffline, nofix: p.cOffline });

/** Single source of truth for a vehicle's status colour — used by the map, the vehicle list and the cards so they always match. */
export function vehState(prefs: ColorPrefs, d: Device, p?: Position) {
  const base = deviceState(d, p);
  const vs = visualState(base, Math.round(knToKmh(p?.speed)), prefs.limit, p?.attributes?.ignition);
  const color = (prefs.colorMode === "device" && deviceColor(d)) || paletteOf(prefs)[vs];
  return { base, vs, color };
}
