export interface DDSGenerationInput {
  request_id: string;
  revision: number;
  service_profile_id: string;
  crew_codes: string[] | null;
  initial_status: string | null;
  target_status: string | null;
  crew_calls_required: boolean;
  replace_existing: boolean;
}
