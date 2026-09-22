import type { FeatureDefinition } from "@/shared/types/features";

export interface FeatureVisibilityEditorProps {
  feature: FeatureDefinition;
  parents: FeatureDefinition[];
  onChange: (rules: NonNullable<FeatureDefinition["visible_when"]>) => void;
}
