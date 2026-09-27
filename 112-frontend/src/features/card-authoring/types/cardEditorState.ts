import type { CardAudio } from "@/entities/recording";
import type { DDSCardExercise, FeatureDefinition } from "@/entities/training";
import type { LocationPickerProps } from "@/shared/ui/location-picker";
import type { FeatureValue } from "@/shared/lib/featureValues";
import type {
  CardTemplatePayloadArgs,
  CardEditorForm,
} from "./CardEditorPanels";

export type CardEditorState = Omit<
  CardTemplatePayloadArgs,
  "initial" | "recipients" | "silent" | "structuredAddress"
> & {
  audio: CardAudio;
  ddsExercise: DDSCardExercise | null;
  notificationRequired: boolean;
  features: FeatureDefinition[];
  optional: string[];
};

export type CardEditorAction =
  | {
      [
        K in
          | "audio"
          | "address"
          | "person"
          | "ddsExercise"
          | "manualRecipients"
          | "optional"
          | "version"
          | "entry"
          | "victims"
      ]: { type: K; value: CardEditorState[K] };
    }[
      | "audio"
      | "address"
      | "person"
      | "ddsExercise"
      | "manualRecipients"
      | "optional"
      | "version"
      | "entry"
      | "victims"]
  | { type: "form"; value: Partial<CardEditorForm> }
  | { type: "flag"; key: string; value: boolean | undefined }
  | { type: "answer"; key: string; value: FeatureValue | undefined }
  | {
      type: "location";
      value: Parameters<LocationPickerProps["onConfirm"]>[0];
    };
