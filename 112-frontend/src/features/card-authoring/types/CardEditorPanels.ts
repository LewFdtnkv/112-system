import type { CardEditorProps } from "./CardEditor";
import type { useCardEditor } from "../model/useCardEditor";
import type { IncidentAddress } from "@/entities/incident-card";
import type { CardTemplateInput } from "@/entities/training";
import type { FeatureValue } from "@/shared/lib/featureValues";
import type { MapPoint } from "@/shared/lib/geo";
import type { SelectOption } from "@/shared/ui/ServerSelect";

export type CardEditorModel = ReturnType<typeof useCardEditor>;

export interface CardEditorTextFieldsProps {
  editor: CardEditorModel;
  fields: string[];
  initial: CardEditorProps["initial"];
}

export interface CardEditorPanelProps {
  editor: CardEditorModel;
  initial: CardEditorProps["initial"];
  onReload: CardEditorProps["onReload"];
}

export interface CardEditorForm {
  title: string;
  caller_message: string;
  instructions: string;
  address_text: string;
  description: string;
  caller_name: string;
  caller_phone: string;
}

export interface CardTemplatePayloadArgs {
  initial: CardEditorProps["initial"];
  form: CardEditorForm;
  version: SelectOption | null;
  entry: SelectOption | null;
  silent: boolean;
  manualRecipients: SelectOption[] | null;
  recipients: string[];
  structuredAddress: string;
  address: IncidentAddress;
  victims: string;
  answers: Record<string, FeatureValue>;
  person: Record<string, string>;
  flags: Record<string, boolean | undefined>;
  location: MapPoint | null;
}

export type CardTemplatePayloadBuilder = (
  args: CardTemplatePayloadArgs,
) => CardTemplateInput;
