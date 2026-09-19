import { backendApi } from "@/shared/api";
import type {
  Analytics,
  Attempt,
  CardData,
  CardTemplate,
  CardListItem,
  CardTemplateInput,
  Classifier,
  ClassifierEntry,
  ClassifierRoute,
  Grade,
  GradeInput,
  GroupItem,
  LessonPage,
  LessonStart,
  Page,
  Recipient,
  ScenarioDetail,
  ScenarioInput,
  ScenarioItem,
  Service,
  StudentLesson,
  UserCreate,
  UserItem,
  UserDetail,
  UserUpdate,
  WorkReview,
  AuditPage,
  ClientObservation,
} from "../model/types";
export type Params = Record<string, string | number | boolean>;
const id = encodeURIComponent;
const get = <T>(path: string, params: Params = {}, signal?: AbortSignal) =>
  backendApi.get(path, { searchParams: params, signal }).json<T>();
const post = <T>(path: string, json: unknown) =>
  backendApi.post(path, { json }).json<T>();
export const trainingApi = {
  automaticGrade: (lessonId: string, studentId: string) =>
    post<Grade | null>(
      `lessons/${id(lessonId)}/students/${id(studentId)}/automatic-evaluation`,
      {},
    ),
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
  users: (params: Params, signal?: AbortSignal) =>
    get<Page<UserItem>>("views/users", params, signal),
  createUser: (body: UserCreate) => post<UserDetail>("users", body),
  user: (userId: string, signal?: AbortSignal) =>
    get<UserDetail>(`users/${id(userId)}`, {}, signal),
  updateUser: (userId: string, body: UserUpdate) =>
    backendApi.patch(`users/${id(userId)}`, { json: body }).json<UserDetail>(),
  groups: (params: Params, signal?: AbortSignal) =>
    get<Page<GroupItem>>("views/groups", params, signal),
  createGroup: (name: string) => post<GroupItem>("groups", { name }),
  addStudent: (groupId: string, studentId: string) =>
    backendApi.put(`groups/${id(groupId)}/students/${id(studentId)}`),
  cards: (params: Params, signal?: AbortSignal) =>
    get<Page<CardListItem>>("views/cards", params, signal),
  card: (cardId: string, signal?: AbortSignal) =>
    get<CardTemplate>(`cards/${id(cardId)}`, {}, signal),
  createCard: (body: CardTemplateInput) => post<CardTemplate>("cards", body),
  scenarios: (params: Params, signal?: AbortSignal) =>
    get<Page<ScenarioItem>>("views/scenarios", params, signal),
  scenario: (versionId: string, signal?: AbortSignal) =>
    get<ScenarioDetail>(`scenarios/${id(versionId)}`, {}, signal),
  saveScenario: (body: ScenarioInput, previousId?: string) =>
    post<ScenarioDetail>(
      previousId ? `scenarios/${id(previousId)}/versions` : "scenarios",
      body,
    ),
  classifiers: (q: string, signal?: AbortSignal) =>
    get<Classifier[]>("classifiers", { q, limit: 20 }, signal),
  entries: (versionId: string, params: Params, signal?: AbortSignal) =>
    get<ClassifierEntry[]>(
      `classifiers/${id(versionId)}/entries`,
      params,
      signal,
    ),
  routes: (versionId: string, entryId: string, signal?: AbortSignal) =>
    get<ClassifierRoute[]>(
      `classifiers/${id(versionId)}/entries/${id(entryId)}/routes`,
      {},
      signal,
    ),
  profiles: (q: string, signal?: AbortSignal) =>
    get<{ id: string; name: string }[]>(
      "service-profiles",
      { q, limit: 20 },
      signal,
    ),
  lessons: (student: boolean, params: Params, signal?: AbortSignal) =>
    get<LessonPage>(
      student ? "views/student/lessons" : "views/lessons",
      params,
      signal,
    ),
  startLesson: (body: LessonStart) =>
    post<{ id: string }>("lessons/start", body),
  studentLesson: (lessonId: string, signal?: AbortSignal) =>
    get<StudentLesson>(`student/lessons/${id(lessonId)}`, {}, signal),
  startAttempt: (assignmentId: string) =>
    post<Attempt>(`student/assignments/${id(assignmentId)}/start`, {}),
  attempt: (attemptId: string, signal?: AbortSignal) =>
    get<Attempt>(`student/attempts/${id(attemptId)}`, {}, signal),
  attemptEntries: (attemptId: string, params: Params, signal?: AbortSignal) =>
    get<ClassifierEntry[]>(
      `student/attempts/${id(attemptId)}/classifier-entries`,
      params,
      signal,
    ),
  recipients: (attemptId: string, entryId: string, signal?: AbortSignal) =>
    get<Recipient[]>(
      `student/attempts/${id(attemptId)}/recipients`,
      { classifier_entry_id: entryId },
      signal,
    ),
  saveDraft: (
    attemptId: string,
    revision: number,
    entryId: string | null,
    data: CardData,
  ) =>
    backendApi
      .put(`student/attempts/${id(attemptId)}/card`, {
        json: { revision, classifier_entry_id: entryId, data },
      })
      .json<Attempt>(),
  submit: (attemptId: string, revision: number) =>
    post<Attempt>(`student/attempts/${id(attemptId)}/submit`, { revision }),
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
  analytics: (params: Params, signal?: AbortSignal) =>
    get<Analytics>("views/analytics", params, signal),
  adminSummary: (signal?: AbortSignal) =>
    get<{ users: number; services: number; classifiers: number }>(
      "views/admin/dashboard",
      {},
      signal,
    ),
  adminServices: (params: Params, signal?: AbortSignal) =>
    get<Page<Service>>("views/admin/services", params, signal),
  adminClassifiers: (params: Params, signal?: AbortSignal) =>
    get<Page<Classifier>>("views/admin/classifiers", params, signal),
  createService: (body: { code: string; name: string }) =>
    post<Service>("admin/services", body),
  createClassifier: (body: unknown) =>
    post<Classifier>("admin/classifiers", body),
  publishClassifier: (versionId: string) =>
    post<Classifier>(`admin/classifiers/${id(versionId)}/publish`, {}),
};
