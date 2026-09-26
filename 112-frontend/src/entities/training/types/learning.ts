export type LessonKind =
  | "introduction"
  | "worked_example"
  | "skill_practice"
  | "practice"
  | "assessment"
  | "review";
export type LearningSkill =
  | "interface"
  | "address"
  | "caller"
  | "classification"
  | "notification"
  | "description"
  | "dds_response"
  | "dds_crews";
export interface AssistancePolicy {
  max_level: "none" | "goal" | "explanation" | "solution";
  on_request: boolean;
}
export interface LearningPolicy {
  version: "learning-v2";
  kind: LessonKind;
  objective: string;
  target_skills: LearningSkill[];
  assistance: AssistancePolicy;
}
export interface LearningMeasure {
  status: "available" | "not_measured" | "pending";
  value: number | null;
  unit: "percent" | "seconds";
  explanation: string;
}
export interface LearningResult {
  correctness: LearningMeasure;
  independence: LearningMeasure;
  interface: LearningMeasure;
  duration: LearningMeasure;
  assistance_available: boolean;
}
export interface LearningSummaryProps {
  policy: LearningPolicy;
  result?: LearningResult | null;
}

export interface LearningHint {
  id: string;
  task: string;
  level: "goal" | "explanation" | "solution";
  text: string;
  target: string | null;
  presentation: "text" | "highlight";
  advance?: "action" | "confirm";
  continue_allowed?: boolean;
  correction?: string | null;
}
export interface HintRead {
  status: "ready" | "waiting" | "disabled" | "complete";
  revision: number;
  hint: LearningHint | null;
}
