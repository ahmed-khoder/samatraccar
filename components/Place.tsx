"use client";
import { useAddress } from "@/lib/api";

/** Address for a coordinate (Traccar geocoder, cached); falls back to coordinates. */
export default function Place({ lat, lon, resolve = true }: { lat: number; lon: number; resolve?: boolean }) {
  const a = useAddress(resolve ? lat : undefined, resolve ? lon : undefined, null);
  return <>{a || `${lat.toFixed(4)}, ${lon.toFixed(4)}`}</>;
}
