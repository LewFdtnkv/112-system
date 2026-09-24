import type { Attempt } from "../model/types";
import type { CrewCommand } from "../model/catalogTypes";
import { apiId as id, apiPost as post } from "./apiClient";

/** DDS crew commands and submission for a student attempt. */
export const ddsApi = {
  action: (
    attemptId: string,
    data: {
      request_id: string;
      revision: number;
      information_event_id: string;
      status: string;
      crew_number: string | null;
      comment: string;
    },
  ) => post<Attempt>(`student/attempts/${id(attemptId)}/dds/actions`, data),
  submit: (attemptId: string, revision: number) =>
    post<Attempt>(`student/attempts/${id(attemptId)}/dds/submit`, { revision }),
  crew: (attemptId: string, data: CrewCommand) =>
    post<Attempt>(`student/attempts/${id(attemptId)}/dds/crews`, data),
};
