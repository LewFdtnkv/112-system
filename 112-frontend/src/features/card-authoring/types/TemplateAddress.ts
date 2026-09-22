import type { IncidentAddress } from "@/entities/incident-card";
export type TemplateAddressProps = {
  value: IncidentAddress;
  onChange: (value: IncidentAddress) => void;
};
