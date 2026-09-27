import { apiId as id, apiPost as post } from "@/shared/api/apiClient";

export const learningHelpApi = {
  hint: (
    attemptId: string,
    request: {
      request_id: string;
      confirm_hint_id?: string;
      check_task?: string;
      trigger: "request" | "automatic" | "guided";
      level: "goal" | "explanation" | "solution";
    },
    signal?: AbortSignal,
  ) =>
    post<import("../types/learning").HintRead>(
      `student/attempts/${id(attemptId)}/hints`,
      request,
      signal,
    ),
};
