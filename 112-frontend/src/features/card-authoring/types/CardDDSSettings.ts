import type { DDSCardExercise } from "@/entities/training";
import type { CrewDefinition } from "@/entities/catalog";
export interface CardDDSSettingsProps {
  value: DDSCardExercise | null;
  onChange: (value: DDSCardExercise | null) => void;
}
export interface DDSCrewExerciseFieldsProps {
  crew: CrewDefinition;
  value: DDSCardExercise;
  onChange: (value: DDSCardExercise) => void;
}
