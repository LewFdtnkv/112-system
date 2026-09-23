import { backendApi } from "@/shared/api";
import type { FeatureValue } from "@/shared/lib/featureValues";
import type {
  CatalogRule,
  CatalogVersion,
  CrewCommand,
  ProfileInput,
  ServiceProfile,
} from "../model/catalogTypes";
import type {
  Analytics,
  Attempt,
  AuditPage,
  CardData,
  CardListItem,
  CardTemplate,
  CardTemplateInput,
  Classifier,
  ClassifierEntry,
  ClassifierRoute,
  ClientObservation,
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
  UserDetail,
  UserItem,
  UserUpdate,
  WorkReview,
} from "../model/types";
import type { Params } from "../types/trainingApi";
const id = encodeURIComponent;
const get = <T>(path: string, params: Params = {}, signal?: AbortSignal) =>
  backendApi.get(path, { searchParams: params, signal }).json<T>();
const post = <T>(path: string, json: unknown) =>
  backendApi.post(path, { json }).json<T>();
export const trainingApi = {
  hint: (
    attemptId: string,
    request: {
      request_id: string;
      trigger: "request" | "automatic";
      level: "goal" | "explanation" | "solution";
    },
  ) =>
    post<import("../types/learning").HintRead>(
      `student/attempts/${id(attemptId)}/hints`,
      request,
    ),
  me: () => get<UserDetail>("users/me"),
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
  importCatalog: (text: string) =>
    backendApi
      .post("admin/classifiers/import", {
        body: text,
        headers: { "Content-Type": "application/json" },
      })
      .json<CatalogVersion>(),
  exportCatalog: (versionId: string) =>
    backendApi.get(`admin/classifiers/${id(versionId)}/export`).blob(),
  cloneCatalog: (versionId: string, label: string) =>
    post<CatalogVersion>(`admin/classifiers/${id(versionId)}/versions`, {
      label,
    }),
  catalogRules: (versionId: string, params: Params, signal?: AbortSignal) =>
    get<
      Page<{ id: string; code: string; name: string; section: string }> & {
        version: CatalogVersion;
      }
    >(`admin/classifiers/${id(versionId)}/entries`, params, signal),
  catalogRule: (versionId: string, entryId: string, signal?: AbortSignal) =>
    get<{ revision: number; entry: CatalogRule }>(
      `admin/classifiers/${id(versionId)}/entries/${id(entryId)}`,
      {},
      signal,
    ),
  updateCatalogRule: (
    versionId: string,
    entryId: string,
    revision: number,
    entry: CatalogRule,
  ) =>
    backendApi
      .put(`admin/classifiers/${id(versionId)}/entries/${id(entryId)}`, {
        json: { expected_revision: revision, entry },
      })
      .json<CatalogVersion>(),
  adminProfiles: (params: Params, signal?: AbortSignal) =>
    get<Page<ServiceProfile>>("admin/service-profiles", params, signal),
  adminProfile: (profileId: string, signal?: AbortSignal) =>
    get<ServiceProfile>(`admin/service-profiles/${id(profileId)}`, {}, signal),
  createProfile: (data: ProfileInput) =>
    post<ServiceProfile>("admin/service-profiles", data),
  updateProfile: (profileId: string, data: ProfileInput, revision: number) =>
    backendApi
      .put(`admin/service-profiles/${id(profileId)}`, {
        json: { ...data, expected_revision: revision },
      })
      .json<ServiceProfile>(),
  publishProfile: (profileId: string) =>
    post<ServiceProfile>(`admin/service-profiles/${id(profileId)}/publish`, {}),
  ddsAction: (
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
  ddsSubmit: (attemptId: string, revision: number) =>
    post<Attempt>(`student/attempts/${id(attemptId)}/dds/submit`, { revision }),
  ddsCrew: (attemptId: string, data: CrewCommand) =>
    post<Attempt>(`student/attempts/${id(attemptId)}/dds/crews`, data),
  profile: (profileId: string, signal?: AbortSignal) =>
    get<ServiceProfile>(`service-profiles/${id(profileId)}`, {}, signal),

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
  retrySemantic: (lessonId: string, studentId: string, attemptId: string) =>
    post<import("../types/semanticAssessment").SemanticReview>(
      `lessons/${id(lessonId)}/students/${id(studentId)}/attempts/${id(attemptId)}/semantic-retry`,
      {},
    ),
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
  disbandGroup: (groupId: string) =>
    backendApi.post(`groups/${id(groupId)}/disband`),
  addStudent: (groupId: string, studentId: string) =>
    backendApi.put(`groups/${id(groupId)}/students/${id(studentId)}`),
  cards: (params: Params, signal?: AbortSignal) =>
    get<Page<CardListItem>>("views/cards", params, signal),
  card: (cardId: string, signal?: AbortSignal) =>
    get<CardTemplate>(`cards/${id(cardId)}`, {}, signal),
  createCard: (body: CardTemplateInput) => post<CardTemplate>("cards", body),
  updateCard: (
    cardId: string,
    body: CardTemplateInput & { revision: number },
  ) =>
    backendApi.put(`cards/${id(cardId)}`, { json: body }).json<CardTemplate>(),
  scenarios: (params: Params, signal?: AbortSignal) =>
    get<Page<ScenarioItem>>("views/scenarios", params, signal),
  scenario: (versionId: string, signal?: AbortSignal) =>
    get<ScenarioDetail>(`scenarios/${id(versionId)}`, {}, signal),
  saveScenario: (body: ScenarioInput, previousId?: string) =>
    post<ScenarioDetail>(
      previousId ? `scenarios/${id(previousId)}/versions` : "scenarios",
      body,
    ),
  services: (q: string, signal?: AbortSignal) =>
    get<Service[]>("services", { q, limit: 20 }, signal),
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
  startExecution: (lessonId: string) =>
    post<StudentLesson>(`student/lessons/${id(lessonId)}/start`, {}),
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
  attemptServices: (attemptId: string, params: Params, signal?: AbortSignal) =>
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
  saveDraft: (
    attemptId: string,
    revision: number,
    entryId: string | null,
    data: CardData,
    recipient_service_ids?: string[] | null,
  ) =>
    backendApi
      .put(`student/attempts/${id(attemptId)}/card`, {
        json: {
          revision,
          classifier_entry_id: entryId,
          data,
          recipient_service_ids,
        },
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
  updateService: (
    serviceId: string,
    body: { name: string; short_name: string | null },
  ) =>
    backendApi
      .patch(`admin/services/${id(serviceId)}`, { json: body })
      .json<Service>(),
  createService: (body: {
    code: string;
    name: string;
    short_name?: string | null;
  }) => post<Service>("admin/services", body),
  createClassifier: (body: unknown) =>
    post<Classifier>("admin/classifiers", body),
  publishClassifier: (versionId: string) =>
    post<Classifier>(`admin/classifiers/${id(versionId)}/publish`, {}),
};

export type { Params } from "../types/trainingApi";
