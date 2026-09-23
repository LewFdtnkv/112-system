import type { MapPoint } from "../../geo";

export type GeocodedAddress = {
  point: MapPoint;
  addressLine: string;
  country: string;
  administrativeAreas: string[];
  localities: string[];
  district: string;
  area: string;
  street: string;
  house: string;
  building: string;
  structure: string;
  apartment: string;
};
