import { type ScenarioDraft } from "@/entities/scenario";
export interface ScenarioFormProps {
  initialValues?: ScenarioDraft;
  onSave: (draft: ScenarioDraft) => void;
}
