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
  mode: "none" | "text" | "visual";
  max_level: "goal" | "explanation" | "solution";
  on_request: boolean;
  idle_seconds: number | null;
}
export interface LearningPolicy {
  version: "learning-v1";
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
