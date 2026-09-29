export interface PreparedCrewEvent {
  status: string;
  seconds_before_start: number;
  crew_number: string | null;
  comment: string;
}
export interface DDSCardExercise {
  workflow?: "crews-v1" | "crews-v2";
  service_profile_id: string;
  initial_crews: { crew_code: string; history: PreparedCrewEvent[] }[];
  required_crews: { crew_code: string; status: string }[];
  messages: { crew_code: string; message: string }[];
  crew_calls_required: boolean;
}
