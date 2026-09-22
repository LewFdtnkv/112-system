import type { CrewDefinition, ProfileInput } from "@/entities/training";

export interface ProfileCrewsProps {
  value: CrewDefinition[];
  contacts: ProfileInput["contacts"];
  onChange: (value: CrewDefinition[]) => void;
}
