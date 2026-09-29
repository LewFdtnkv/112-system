import type { FeatureValue } from "@/shared/lib/featureValues";
export type IncidentStatus =
  "in_progress" | "not_notified" | "notified" | "closed";

export type ResponseService = string;

export interface IncidentCategory {
  id: string;
  name: string;
  defaultServices: readonly ResponseService[];
}

export interface IncidentTagGroup {
  label: string;
  options: readonly string[];
}

export interface IncidentAddress {
  country?: string;
  region?: string;
  locality?: string;
  object?: string;
  structure?: string;
  doorCode?: string;
  district: string;
  area: string;
  street: string;
  house: string;
  building: string;
  apartment: string;
  entrance: string;
  floor: string;
  description: string;
}

export interface IncidentPhones {
  callerId: string;
  provided: string;
  onSite: string;
}

export interface IncidentCardDetails {
  buildingFloors?: string;
  classificationDescription?: string;
  callerStatus?: string;
  callerGender?: string;
  callerAge?: string;
  foreignLanguage?: boolean;
  hasVictims?: boolean;
  noContact?: boolean;
  callDropped?: boolean;
  refusedAmbulance?: boolean;
  blocked?: boolean;
  clarifications?: Record<string, readonly string[]>;
}

export interface IncidentCardFields {
  location?: import("@/shared/lib/geo").MapPoint | null;
  manualServices?:
    { id: string; name: string; short_name?: string | null }[] | null;
  ekpAnswers?: Record<string, FeatureValue>;
  details?: IncidentCardDetails;
  categoryId: string;
  address: IncidentAddress;
  callerName: string;
  phones: IncidentPhones;
  victimsCount: number | null;
  description: string;
  operatorAction: string;
  services: readonly ResponseService[];
  status: IncidentStatus;
}

export interface IncidentCard {
  categoryName?: string;
  displayNumber?: number;
  createdDate?: string;
  operatorNumber?: string;
  workstation?: string;
  id: string;
  createdAt: string;
  channel: string;
  origin: "generated" | "student";
  fields: IncidentCardFields;
}
