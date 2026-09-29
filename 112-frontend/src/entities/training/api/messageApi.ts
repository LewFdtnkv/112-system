import { backendApi } from "@/shared/api";
import type { Page } from "@/shared/types/pagination";
import type {
  Message,
  MessageSummary,
  ReferralLesson,
} from "../types/activityApi";
export const messageApi = {
  messages: (
    offset = 0,
    includeAdvice = true,
    signal?: AbortSignal,
    unreadOnly = false,
  ) =>
    backendApi
      .get("student/messages", {
        searchParams: {
          offset,
          include_advice: includeAdvice,
          unread_only: unreadOnly,
        },
        signal,
      })
      .json<Page<Message>>(),
  messageSummary: (signal?: AbortSignal) =>
    backendApi
      .get("student/messages/summary", { signal })
      .json<MessageSummary>(),
  recommendationFeedback: (id: string, helpful: boolean) =>
    backendApi.post(`student/messages/${encodeURIComponent(id)}/feedback`, {
      searchParams: { helpful },
    }),
  createReferralLesson: (id: string) =>
    backendApi
      .post(`student/learning-referrals/${encodeURIComponent(id)}/lesson`)
      .json<ReferralLesson>(),
  readMessage: (id: string) => backendApi.post(`student/messages/${id}/read`),
  send: (text: string, target: { group_id?: string; student_id?: string }) =>
    backendApi
      .post("messages", { json: { text, ...target } })
      .json<{ recipient_count: number }>(),
};
