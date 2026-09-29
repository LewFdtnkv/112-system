import {
  type IncidentCard,
  type IncidentCardFields,
} from "@/entities/incident-card";
import type { useIncidentEditor } from "../model/useIncidentEditor";
export interface RemoteEditor {
  editableSkills?: string[] | null;
  highlightTarget?: string | null;
  serviceQueryKey?: string;
  loadServices?: (
    q: string,
    offset: number,
    signal: AbortSignal,
  ) => Promise<{
    items: { id: string; name: string; short_name?: string | null }[];
    total: number;
  }>;
  features?: import("@/shared/lib/featureValues").FeatureDefinition[];
  categories: { id: string; name: string; short_name?: string | null }[];
  popularCategories?: {
    id: string;
    name: string;
    short_name?: string | null;
  }[];
  notificationRequired?: boolean;
  categoryName: string;
  services: { id: string; name: string; short_name?: string | null }[];
  search: (value: string) => void;
  select: (id: string) => void;
  onSave: (fields: IncidentCardFields) => Promise<void>;
  message?: string;
  searching: boolean;
  error?: string;
  onFieldsChange?: (fields: IncidentCardFields) => void;
}

export interface IncidentEditorOptions {
  remote: RemoteEditor;
  card: IncidentCard;
  log: readonly string[];
  isSubmitted: boolean;
  isCallAccepted: boolean;
  onSubmit: (fields: IncidentCardFields) => void | Promise<void>;
}

export type IncidentEditor = ReturnType<typeof useIncidentEditor>;

export interface EditorCommand {
  kind: "save" | "submit";
  fields: IncidentCardFields;
}
