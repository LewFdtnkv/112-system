import type { DDSCardExercise } from "./ddsExercise";
import type {
  ClassifierEntry,
  Recipient,
} from "@/entities/catalog/@x/training";

export interface CardData {
  caller_name?: string | null;
  caller_phone?: string | null;
  caller_details?: Record<string, unknown> | null;
  address_text?: string | null;
  address_details?: Record<string, unknown> | null;
  description?: string | null;
  victim_details?: string | null;
  features?: Record<string, unknown> | null;
  additional_fields: Record<string, unknown>;
}

export interface CardTemplate {
  dds_exercise?: DDSCardExercise | null;
  generation_example?: boolean;
  generated_by_ai?: boolean;
  generation_method?: string | null;
  generation_note?: string | null;
  generation_template?: string | null;
  revision: number;
  updated_at: string;
  created_at: string;
  classifier_label: string;
  can_edit: boolean;
  scenario_count: number;
  classifier_entry?: ClassifierEntry | null;
  recipients?: Recipient[];
  id: string;
  title: string;
  classifier_version_id: string;
  classifier_entry_id: string | null;
  caller_message: string | null;
  instructions: string;
  data: CardData;
  recipient_service_ids: string[];
}

export type CardListItem = Pick<
  CardTemplate,
  | "id"
  | "title"
  | "classifier_version_id"
  | "classifier_entry_id"
  | "revision"
  | "updated_at"
  | "created_at"
  | "scenario_count"
  | "classifier_label"
  | "generated_by_ai"
> & { incident_name: string; address_text: string; recipients: Recipient[] };

export type CardTemplateInput = Pick<
  CardTemplate,
  | "dds_exercise"
  | "title"
  | "classifier_version_id"
  | "classifier_entry_id"
  | "caller_message"
  | "instructions"
  | "data"
  | "recipient_service_ids"
> & { use_recommended_recipients?: boolean };
