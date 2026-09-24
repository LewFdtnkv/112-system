import type { Grade, GradeInput, WorkReview } from "../model/types";
import { apiGet as get, apiId as id, apiPost as post } from "./apiClient";

/** Teacher review and student evaluation endpoints. */
export const reviewApi = {
  automaticGrade: (lessonId: string, studentId: string) =>
    post<Grade | null>(
      `lessons/${id(lessonId)}/students/${id(studentId)}/automatic-evaluation`,
      {},
    ),
  retrySemantic: (lessonId: string, studentId: string, attemptId: string) =>
    post<import("../types/semanticAssessment").SemanticReview>(
      `lessons/${id(lessonId)}/students/${id(studentId)}/attempts/${id(attemptId)}/semantic-retry`,
      {},
    ),
  review: (lessonId: string, studentId: string, signal?: AbortSignal) =>
    get<WorkReview>(
      `lessons/${id(lessonId)}/students/${id(studentId)}/work`,
      {},
      signal,
    ),
  grade: (lessonId: string, studentId: string, body: GradeInput) =>
    post<Grade>(
      `lessons/${id(lessonId)}/students/${id(studentId)}/evaluations`,
      body,
    ),
  evaluation: (lessonId: string, signal?: AbortSignal) =>
    get<Grade | null>(`student/lessons/${id(lessonId)}/evaluation`, {}, signal),
};
