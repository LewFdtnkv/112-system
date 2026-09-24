import type { CatalogRule } from "@/entities/training";

export type RuleFormChange = (form: CatalogRule) => void;

export type RuleGeneralFieldsProps = {
  form: CatalogRule;
  onChange: RuleFormChange;
};
export type RuleFeaturesEditorProps = {
  form: CatalogRule;
  onChange: RuleFormChange;
};
export type RuleRoutesEditorProps = {
  form: CatalogRule;
  editable: boolean;
  onChange: RuleFormChange;
};
