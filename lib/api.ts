"use client";
import useSWR, { SWRConfiguration } from "swr";
import type { Device, Position, Geofence, Group } from "./types";

export const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (r.status === 401) { window.location.href = "/login"; throw new Error("unauthorized"); }
  if (!r.ok) throw new Error(await r.text());
  return r.json();
};

const api = (p: string) => `/api/t/${p}`;

export const useDevices = () => useSWR<Device[]>(api("devices"), fetcher, { refreshInterval: 10000 });
export const usePositions = () => useSWR<Position[]>(api("positions"), fetcher, { refreshInterval: 4000 });
export const useGeofences = () => useSWR<Geofence[]>(api("geofences"), fetcher);
export const useGroups = () => useSWR<Group[]>(api("groups"), fetcher);

export function useReport<T>(kind: string, range: { from: string; to: string } | null, deviceId?: number | null, extra = "", cfg?: SWRConfiguration) {
  const q = range
    ? `${api("reports/" + kind)}?${deviceId ? `deviceId=${deviceId}&` : ""}from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}${extra}`
    : null;
  return useSWR<T>(q, fetcher, { revalidateOnFocus: false, ...cfg });
}

export const useRoute = (id: number, r: { from: string; to: string }) => useReport<Position[]>("route", r, id);
