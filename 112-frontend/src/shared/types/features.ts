export type FeatureValue = boolean | string | string[];

export interface FeatureDefinition {
  key: string;
  label: string;
  type?: "boolean" | "choice" | "array" | "text";
  required?: boolean;
  options?: string[];
  /** Groups are joined by OR; conditions within a group by AND. */
  visible_when?: Record<string, FeatureValue>[];
}

export interface FeatureInputProps {
  feature: FeatureDefinition;
  value: FeatureValue | undefined;
  onChange: (value: FeatureValue | undefined) => void;
  disabled?: boolean;
  condition?: boolean;
}
