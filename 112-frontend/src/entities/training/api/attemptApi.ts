import { backendApi } from "@/shared/api";
import type { FeatureValue } from "@/shared/lib/featureValues";
import type {
  Attempt,
  AuditPage,
  CardData,
  ClassifierEntry,
  ClientObservation,
  Page,
  Recipient,
  Service,
} from "../model/types";
import type { Params } from "../types/trainingApi";
import { apiGet as get, apiId as id } from "./apiClient";

/** Student attempt reads and commands. */
export const attemptApi = {
  get: (attemptId: string, signal?: AbortSignal) =>
    get<Attempt>(`student/attempts/${id(attemptId)}`, {}, signal),
  entries: (attemptId: string, params: Params, signal?: AbortSignal) =>
    get<ClassifierEntry[]>(
      `student/attempts/${id(attemptId)}/classifier-entries`,
      params,
      signal,
    ),
  allEntries: async (
    attemptId: string,
    signal?: AbortSignal,
  ): Promise<ClassifierEntry[]> => {
    const entries: ClassifierEntry[] = [];
    const limit = 100;
    for (;;) {
      const page = await attemptApi.entries(
        attemptId,
        { limit, offset: entries.length },
        signal,
      );
      entries.push(...page);
      if (page.length < limit) return entries;
    }
  },
  services: (attemptId: string, params: Params, signal?: AbortSignal) =>
    get<Page<Service>>(
      `student/attempts/${id(attemptId)}/services`,
      params,
      signal,
    ),
  recipients: (attemptId: string, entryId: string, signal?: AbortSignal) =>
    get<Recipient[]>(
      `student/attempts/${id(attemptId)}/recipients`,
      { classifier_entry_id: entryId },
      signal,
    ),
  previewRecipients: (
    attemptId: string,
    entryId: string,
    answers: Record<string, FeatureValue>,
    signal?: AbortSignal,
  ) =>
    backendApi
      .post(`student/attempts/${id(attemptId)}/recipients-preview`, {
        json: { classifier_entry_id: entryId, answers },
        signal,
      })
      .json<Recipient[]>(),
  saveDraft: (
    attemptId: string,
    revision: number,
    entryId: string | null,
    data: CardData,
    recipientServiceIds?: string[] | null,
  ) =>
    backendApi
      .put(`student/attempts/${id(attemptId)}/card`, {
        json: {
          revision,
          classifier_entry_id: entryId,
          data,
          recipient_service_ids: recipientServiceIds,
        },
      })
      .json<Attempt>(),
  submit: (attemptId: string, revision: number) =>
    backendApi
      .post(`student/attempts/${id(attemptId)}/submit`, { json: { revision } })
      .json<Attempt>(),
  observations: (attemptId: string, events: ClientObservation[]) =>
    backendApi
      .post(`student/attempts/${id(attemptId)}/observations`, {
        json: { events },
        timeout: 5000,
        retry: 0,
      })
      .json<{ accepted: number }>(),
  audit: (
    lessonId: string,
    studentId: string,
    attemptId: string,
    after: number,
    signal?: AbortSignal,
  ) =>
    get<AuditPage>(
      `lessons/${id(lessonId)}/students/${id(studentId)}/attempts/${id(attemptId)}/events`,
      { after, limit: 30 },
      signal,
    ),
};
