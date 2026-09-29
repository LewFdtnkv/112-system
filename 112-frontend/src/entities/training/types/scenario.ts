import type { CardData } from "./card";
import type { AssessmentPolicy } from "./review";
import type { DDSPolicy } from "../model/catalogTypes";

export interface ScenarioInput {
  dds_policy?: DDSPolicy | null;
  assessment_policy?: AssessmentPolicy;
  title: string;
  category: string;
  difficulty: "basic" | "intermediate" | "advanced";
  duration_minutes: number;
  norm_seconds: number;
  instructions: string;
  status: "draft" | "published";
  role: "operator_112" | "dds";
  card_ids: string[];
  arrival_offsets_seconds?: number[];
  service_profile_id: string | null;
}

export interface ScenarioItem extends Omit<
  ScenarioInput,
  "card_ids" | "instructions"
> {
  id: string;
  scenario_id: string;
  version: number;
  card_count: number;
  classifier_version_id: string;
}

export interface ScenarioDetail extends Omit<ScenarioItem, "card_count"> {
  instructions: string;
  cards: {
    id: string;
    card_template_id: string;
    position: number;
    arrival_offset_seconds?: number;
    snapshot: { title: string; data: CardData };
  }[];
}
