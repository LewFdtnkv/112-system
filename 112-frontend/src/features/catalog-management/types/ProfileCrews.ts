import type { CrewDefinition, ProfileInput } from "@/entities/catalog";

export interface ProfileCrewsProps {
  value: CrewDefinition[];
  contacts: ProfileInput["contacts"];
  onChange: (value: CrewDefinition[]) => void;
}
