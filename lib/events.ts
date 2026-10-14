import type { Key } from "./dict";

type T = (k: Key, v?: Record<string, string | number>) => string;
const KNOWN = new Set([
  "deviceOnline", "deviceOffline", "deviceUnknown", "deviceInactive", "deviceMoving", "deviceStopped", "deviceOverspeed", "deviceFuelDrop", "deviceFuelIncrease",
  "geofenceEnter", "geofenceExit", "alarm", "ignitionOn", "ignitionOff", "maintenance", "textMessage", "driverChanged", "commandResult", "media",
]);
export const EVENT_TYPES = [...KNOWN];

export function evLabel(t: T, type: string) {
  return KNOWN.has(type) ? t(`ev.${type}` as Key) : type;
}

export const EVENT_COLOR: Record<string, string> = {
  deviceOnline: "#34d399", deviceOffline: "#64748b", deviceUnknown: "#64748b", deviceInactive: "#64748b",
  deviceMoving: "#22d3ee", deviceStopped: "#fbbf24", deviceOverspeed: "#f43f5e", alarm: "#f43f5e",
  geofenceEnter: "#8b5cf6", geofenceExit: "#a78bfa", ignitionOn: "#34d399", ignitionOff: "#fb923c",
};

export function alarmLabel(t: T, alarm: string) {
  const k = `alarm.${alarm}` as Key;
  const v = t(k);
  return v === k ? alarm : v;
}
