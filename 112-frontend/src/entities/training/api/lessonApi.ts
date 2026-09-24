import { backendApi } from "@/shared/api";
import type {
  Attempt,
  LessonPage,
  LessonStart,
  StudentLesson,
} from "../model/types";
import type { Params } from "../types/trainingApi";
import { apiGet as get, apiId as id } from "./apiClient";

/** Lesson lifecycle: lists, assignment start, and the student's lesson view. */
export const lessonApi = {
  list: (student: boolean, params: Params, signal?: AbortSignal) =>
    get<LessonPage>(
      student ? "views/student/lessons" : "views/lessons",
      params,
      signal,
    ),
  start: (body: LessonStart) =>
    backendApi.post("lessons/start", { json: body }).json<{ id: string }>(),
  studentLesson: (lessonId: string, signal?: AbortSignal) =>
    get<StudentLesson>(`student/lessons/${id(lessonId)}`, {}, signal),
  startExecution: (lessonId: string) =>
    backendApi
      .post(`student/lessons/${id(lessonId)}/start`)
      .json<StudentLesson>(),
  startAttempt: (assignmentId: string) =>
    backendApi
      .post(`student/assignments/${id(assignmentId)}/start`)
      .json<Attempt>(),
};
