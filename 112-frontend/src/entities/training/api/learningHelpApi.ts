import { apiId as id, apiPost as post } from "./apiClient";

export const learningHelpApi = {
  hint: (
    attemptId: string,
    request: {
      request_id: string;
      confirm_hint_id?: string;
      trigger: "request" | "automatic" | "guided";
      level: "goal" | "explanation" | "solution";
    },
  ) =>
    post<import("../types/learning").HintRead>(
      `student/attempts/${id(attemptId)}/hints`,
      request,
    ),
};
