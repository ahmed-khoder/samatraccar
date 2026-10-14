import {
  Car, CarFront, Truck, Bus, Bike, Tractor, Ship, Plane, TrainFront, User, PawPrint, Navigation, Caravan, Forklift,
  Motorbike, Van, Helicopter, TramFront, Construction, Sailboat, type LucideIcon,
} from "lucide-react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Device } from "./types";

/** Side view of a tractor unit hauling a shipping container (same props as a lucide icon). */
const ContainerTruckIcon = (({ size = 24, color = "currentColor", strokeWidth = 2, className, style }: {
  size?: number | string; color?: string; strokeWidth?: number | string; className?: string; style?: React.CSSProperties;
}) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
    strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
    <rect x="1" y="5" width="14.5" height="8.5" rx="0.8" />
    <path d="M4.5 5.6v7.3M7.5 5.6v7.3M10.5 5.6v7.3M13 5.6v7.3" strokeWidth="1.1" />
    <path d="M1 15.5h20.2V13M15.8 15.5v-5.2h3.4l2.4 2.7v2.5" />
    <circle cx="4.6" cy="17.6" r="1.6" /><circle cx="9" cy="17.6" r="1.6" /><circle cx="18.6" cy="17.6" r="1.6" />
  </svg>
)) as unknown as LucideIcon;

// Categories supported natively by the Traccar `device.category` field.
export const CATEGORIES: { key: string; icon: LucideIcon }[] = [
  { key: "default", icon: Navigation },
  { key: "car", icon: Car },
  { key: "pickup", icon: CarFront },
  { key: "van", icon: Van },
  { key: "truck", icon: Truck },
  { key: "container", icon: ContainerTruckIcon },
  { key: "bus", icon: Bus },
  { key: "motorcycle", icon: Motorbike },
  { key: "scooter", icon: Bike },
  { key: "bicycle", icon: Bike },
  { key: "tractor", icon: Tractor },
  { key: "crane", icon: Construction },
  { key: "offroad", icon: Forklift },
  { key: "camper", icon: Caravan },
  { key: "boat", icon: Sailboat },
  { key: "ship", icon: Ship },
  { key: "plane", icon: Plane },
  { key: "helicopter", icon: Helicopter },
  { key: "train", icon: TrainFront },
  { key: "tram", icon: TramFront },
  { key: "trolleybus", icon: Bus },
  { key: "person", icon: User },
  { key: "animal", icon: PawPrint },
];

export const iconOf = (category?: string | null): LucideIcon =>
  CATEGORIES.find((c) => c.key === (category || "default"))?.icon ?? Navigation;

export const COLORS = ["#22d3ee", "#34d399", "#a3e635", "#fbbf24", "#fb923c", "#f43f5e", "#f472b6", "#a78bfa", "#60a5fa", "#e2e8f0"];

/** User-chosen accent color stored in the device attributes (falls back to none). */
export const deviceColor = (d?: Device | null) => (d?.attributes?.tracarColor as string | undefined) || null;

export function iconSvg(category: string | null | undefined, size: number, color: string) {
  const I = iconOf(category);
  return renderToStaticMarkup(<I size={size} color={color} strokeWidth={2.2} />);
}

/**
 * Categories drawn as a top-down silhouette that rotates with the heading
 * (instead of an upright icon inside a round badge). Front of the vehicle points up.
 */
export const TOP_VIEW: Record<string, { w: number; h: number; svg: (c: string) => string }> = {
  container: {
    w: 26, h: 66,
    svg: (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 26 66" width="26" height="66">
      <g fill="#05080f">
        <rect x="0.5" y="6" width="3" height="7" rx="1"/><rect x="22.5" y="6" width="3" height="7" rx="1"/>
        <rect x="0.5" y="26" width="3" height="6" rx="1"/><rect x="22.5" y="26" width="3" height="6" rx="1"/>
        <rect x="0.5" y="52" width="3" height="6" rx="1"/><rect x="22.5" y="52" width="3" height="6" rx="1"/>
        <rect x="0.5" y="59" width="3" height="6" rx="1"/><rect x="22.5" y="59" width="3" height="6" rx="1"/>
        <rect x="10" y="14" width="6" height="12"/>
      </g>
      <rect x="3" y="24" width="20" height="41" rx="1.6" fill="${c}" stroke="#fff" stroke-width="1.3"/>
      ${[7, 10.5, 14, 17.5, 21].map((x) => `<line x1="${x - 1}" y1="26.5" x2="${x - 1}" y2="62.5" stroke="rgba(0,0,0,.3)" stroke-width="1.1"/>`).join("")}
      <rect x="3" y="24" width="20" height="3" fill="rgba(0,0,0,.28)"/><rect x="3" y="62" width="20" height="3" fill="rgba(0,0,0,.28)"/>
      <rect x="4.5" y="1.5" width="17" height="19" rx="4.5" fill="${c}" stroke="#fff" stroke-width="1.3"/>
      <path d="M6.5 5.5q6.5-2 13 0l.6 5.2h-14.2z" fill="#0b1220" opacity=".9"/>
      <rect x="6" y="13" width="14" height="5" rx="1.2" fill="rgba(0,0,0,.28)"/>
      <rect x="1.4" y="3.5" width="2.4" height="3.6" rx=".8" fill="#e2e8f0"/><rect x="22.2" y="3.5" width="2.4" height="3.6" rx=".8" fill="#e2e8f0"/>
    </svg>`,
  },
};
