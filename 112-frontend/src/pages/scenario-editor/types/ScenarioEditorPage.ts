import type { ScenarioDetail, ScenarioInput } from "@/entities/training";
import type { SelectOption } from "@/shared/ui/ServerSelect";
export type EditorProps = { initial?: ScenarioDetail };

export type ScenarioMetadataFieldsProps = {
  form: ScenarioInput;
  onChange: (form: ScenarioInput) => void;
};

export type ScenarioCardsFieldsProps = {
  profileId?: string;
  role: ScenarioInput["role"];
  cards: SelectOption[];
  choice: SelectOption | null;
  delays: number[];
  offsets: number[];
  onChoiceChange: (choice: SelectOption | null) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onMove: (index: number, step: number) => void;
  onDelayChange: (index: number, value: number) => void;
};

export type ScenarioDdsSettingsProps = {
  form: ScenarioInput;
  profile: SelectOption | null;
  onChange: (form: ScenarioInput) => void;
  onProfileChange: (profile: SelectOption | null) => void;
};
