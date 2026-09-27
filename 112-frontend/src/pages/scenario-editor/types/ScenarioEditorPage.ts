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
  profile: SelectOption | null;
  onProfileChange: (profile: SelectOption | null) => void;
};

export type ScenarioEditorState = {
  form: ScenarioInput;
  profile: SelectOption | null;
  choice: SelectOption | null;
  rows: { card: SelectOption; delay: number }[];
};
export type ScenarioEditorAction =
  | { type: "form"; value: ScenarioInput }
  | { type: "profile" | "choice"; value: SelectOption | null }
  | { type: "add" }
  | { type: "remove"; index: number }
  | { type: "move"; index: number; step: number }
  | { type: "delay"; index: number; value: number };
