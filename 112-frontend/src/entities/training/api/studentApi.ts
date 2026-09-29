import { backendApi } from "@/shared/api";
import type { StudentOverview } from "../model/studentOverview";
import type { LessonPage } from "../model/types";
import type { UserDetail } from "@/entities/user/@x/training";
export const studentApi = {
  overview: (
    studentId?: string,
    activeOffset = 0,
    signal?: AbortSignal,
    availableOffset = 0,
  ) =>
    backendApi
      .get(
        studentId
          ? `teaching/students/${encodeURIComponent(studentId)}/overview`
          : "student/overview",
        {
          searchParams: {
            active_offset: activeOffset,
            available_offset: availableOffset,
          },
          signal,
        },
      )
      .json<StudentOverview>(),
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
};
