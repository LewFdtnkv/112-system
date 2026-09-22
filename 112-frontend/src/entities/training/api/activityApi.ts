import { backendApi } from "@/shared/api";
import type { StudentOverview } from "../model/studentOverview";
import type { LessonPage, Page, UserDetail } from "../model/types";
import type {
  Activity,
  FocusKind,
  Message,
  ProctoringEvent,
} from "../types/activityApi";
export const activityApi = {
  overview: (studentId?: string, activeOffset = 0, signal?: AbortSignal) =>
    backendApi
      .get(
        studentId
          ? `teaching/students/${encodeURIComponent(studentId)}/overview`
          : "student/overview",
        { searchParams: { active_offset: activeOffset }, signal },
      )
      .json<StudentOverview>(),
  monitoring: (offset = 0) =>
    backendApi.get("teaching/monitoring", { searchParams: { offset } }).json<
      Page<{
        attempt_id: string;
        student_name: string;
        title: string;
        visibility: string | null;
        focus: string | null;
        last_seen: string | null;
        hidden_count: number;
      }>
    >(),
  messages: (offset = 0) =>
    backendApi
      .get("student/messages", { searchParams: { offset } })
      .json<Page<Message>>(),
  readMessage: (id: string) => backendApi.post(`student/messages/${id}/read`),
  send: (text: string, target: { group_id?: string; student_id?: string }) =>
    backendApi
      .post("messages", { json: { text, ...target } })
      .json<{ recipient_count: number }>(),
  remove: (group: string, student: string) =>
    backendApi.delete(`groups/${group}/students/${student}`),
  transfer: (group: string, student: string, target: string) =>
    backendApi.post(`groups/${group}/students/${student}/transfer`, {
      json: { target_group_id: target },
    }),
  profile: (id: string, offset = 0) =>
    backendApi
      .get(`teaching/students/${id}`, { searchParams: { offset } })
      .json<{ user: UserDetail; lessons: LessonPage }>(),
  report: (
    format: "txt" | "xlsx",
    params: { student_id?: string; group_id?: string } = {},
  ) =>
    backendApi
      .get("teaching/reports/export", { searchParams: { format, ...params } })
      .blob(),
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
  photo: (id: string) => backendApi.get(`users/${id}/photo`).blob(),
  uploadPhoto: (id: string, file: File) =>
    backendApi.put(`admin/users/${id}/photo`, { body: file }),
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
  deleteScenario: (id: string) =>
    backendApi.delete(`scenarios/${id}`).json<{ result: string }>(),
};

export type {
  Activity,
  FocusKind,
  Message,
  ProctoringEvent,
} from "../types/activityApi";
