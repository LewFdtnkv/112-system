import { backendApi } from "@/shared/api";
import type { Page } from "@/shared/types/pagination";
import type {
  FocusKind,
  MonitoringRow,
  ProctoringEvent,
} from "../types/activityApi";
export const proctoringApi = {
  monitoring: (offset = 0) =>
    backendApi
      .get("teaching/monitoring", { searchParams: { offset } })
      .json<Page<MonitoringRow>>(),
  proctoring: (
    attempt: string,
    events: {
      command_id: string;
      kind: FocusKind;
      client_occurred_at: string;
    }[],
  ) =>
    backendApi.post(`student/attempts/${attempt}/proctoring`, {
      json: { events },
      timeout: 5000,
      retry: 0,
    }),
  proctoringHistory: (id: string, offset = 0) =>
    backendApi
      .get(`teaching/attempts/${id}/proctoring`, { searchParams: { offset } })
      .json<Page<ProctoringEvent>>(),
};
