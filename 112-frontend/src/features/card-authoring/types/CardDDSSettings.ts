import type { DDSCardExercise, CrewDefinition } from "@/entities/training";
export interface CardDDSSettingsProps {
  value: DDSCardExercise | null;
  onChange: (value: DDSCardExercise | null) => void;
}
export interface DDSCrewExerciseFieldsProps {
  crew: CrewDefinition;
  value: DDSCardExercise;
  onChange: (value: DDSCardExercise) => void;
}
