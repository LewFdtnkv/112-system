import { backendApi } from "@/shared/api";
import type { Page } from "@/shared/types/pagination";
import type { Activity } from "../types/activity";
export const userAuditApi = {
  activity: (id: string, offset = 0) =>
    backendApi
      .get(`admin/users/${id}/activity`, { searchParams: { offset } })
      .json<Page<Activity>>(),
  activityExport: (id: string, format: "txt" | "xlsx") =>
    backendApi
      .get(`admin/users/${id}/activity/export`, { searchParams: { format } })
      .blob(),
  systemLogs: () => backendApi.get("admin/system-logs/export").blob(),
  statistics: () =>
    backendApi.get("admin/statistics").json<
      {
        role: string;
        registered: number;
        enabled: number;
        sessions: number;
      }[]
    >(),
};
