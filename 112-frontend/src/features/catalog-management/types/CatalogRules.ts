import { type CatalogRule } from "@/entities/catalog";
export type CatalogFilesProps = { onImported: () => void };

export type CatalogRulesProps = {
  versionId: string;
  onClose: () => void;
  onChanged: () => void;
};

export type RuleFormProps = {
  initial: CatalogRule;
  editable: boolean;
  save: (entry: CatalogRule) => Promise<unknown>;
  onSaved: () => void;
};
