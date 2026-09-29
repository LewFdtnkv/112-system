import type { Page } from "@/shared/types/pagination";

export interface Analytics {
  total: number;
  submitted: number;
  graded: number;
  average_score_percent: number | null;
  scenarios: Page<{
    scenario_version_id: string;
    title: string;
    total: number;
    submitted: number;
    graded: number;
    average_score_percent: number | null;
  }>;
}
