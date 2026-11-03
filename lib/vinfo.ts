// The registration data of a vehicle, as the iTrack app shows it. Traccar has native fields for the IMEI (uniqueId), the SIM
// number (phone) and the device type (model); the ICCID lives in the device's attributes. The vehicle name is its plate number.
import type { Device } from "./types";

export type InfoAttr = "iccid";

export const infoAttr = (d: Device, k: InfoAttr) => {
  const v = d.attributes?.[k];
  return typeof v === "string" && v.trim() ? v.trim() : "";
};
