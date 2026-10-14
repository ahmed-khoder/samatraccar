export interface Device {
  id: number;
  name: string;
  uniqueId: string;
  status: "online" | "offline" | "unknown";
  disabled: boolean;
  lastUpdate: string | null;
  positionId: number | null;
  groupId: number | null;
  phone: string | null;
  model: string | null;
  contact: string | null;
  category: string | null;
  attributes: Record<string, unknown>;
}

export interface Position {
  id: number;
  deviceId: number;
  protocol: string;
  serverTime: string;
  deviceTime: string;
  fixTime: string;
  valid: boolean;
  latitude: number;
  longitude: number;
  altitude: number;
  speed: number; // knots
  course: number;
  address: string | null;
  accuracy: number;
  attributes: {
    batteryLevel?: number;
    battery?: number;
    ignition?: boolean;
    motion?: boolean;
    totalDistance?: number;
    distance?: number;
    hours?: number;
    rssi?: number;
    sat?: number;
    fuel?: number;
    rpm?: number;
    temp1?: number;
    charge?: boolean;
    alarm?: string;
    [k: string]: unknown;
  };
}

export interface Group { id: number; name: string; groupId: number }
export interface Geofence { id: number; name: string; description: string; area: string }

export interface Trip {
  deviceId: number;
  deviceName: string;
  distance: number;
  averageSpeed: number;
  maxSpeed: number;
  spentFuel: number;
  duration: number;
  startTime: string;
  startAddress: string | null;
  startLat: number;
  startLon: number;
  endTime: string;
  endAddress: string | null;
  endLat: number;
  endLon: number;
  driverName: string | null;
}

export interface Stop {
  deviceId: number;
  deviceName: string;
  duration: number;
  startTime: string;
  endTime: string;
  address: string | null;
  lat: number;
  lon: number;
  engineHours: number;
  spentFuel: number;
}

export interface Summary {
  deviceId: number;
  deviceName: string;
  distance: number;
  averageSpeed: number;
  maxSpeed: number;
  spentFuel: number;
  startOdometer: number;
  endOdometer: number;
  engineHours: number;
  startTime: string;
}

export interface TEvent {
  id: number;
  type: string;
  eventTime: string;
  deviceId: number;
  positionId: number;
  geofenceId: number;
  attributes: Record<string, unknown>;
}

export interface User { id: number; name: string; email: string; administrator: boolean }
