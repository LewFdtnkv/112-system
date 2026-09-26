import type { CardData } from "./card";
import type { LearningPolicy } from "./learning";
import type { DDSContext } from "../model/catalogTypes";
import type { ClassifierEntry, Recipient } from "./catalog";

export interface Attempt {
  exercise_scope?: string[] | null;
  learning: LearningPolicy;
  role?: "operator_112" | "dds";
  dds?: DDSContext | null;
  id: string;
  assignment_id: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  caller_message: string | null;
  instructions: string;
  time_limit_seconds: number | null;
  norm_seconds: number;
  card: {
    recipient_service_ids?: string[] | null;
    id: string;
    display_number: number;
    revision: number;
    classifier_version_id: string;
    classifier_entry_id: string | null;
    status: string;
    data: CardData;
    opened_at: string | null;
    saved_at: string | null;
  };
  classifier_entry: ClassifierEntry | null;
  notified_services: Recipient[];
  recipient_services: Recipient[];
  recipient_error: string | null;
}
