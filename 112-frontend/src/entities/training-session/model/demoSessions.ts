import type {
  DemoTrainingResult,
  DemoTrainingSession,
  TrainingStatus,
} from "../types/demoSessions";

export const trainingStatusLabels: Record<TrainingStatus, string> = {
  assigned: "Назначено",
  active: "В процессе",
  completed: "Завершено",
};

export const demoSessions: DemoTrainingSession[] = [
  {
    id: "demo-session-1",
    scenarioId: "demo-scenario-1",
    studentId: "demo-student-1",
    teacherId: "demo-teacher-1",
    status: "assigned",
    scheduledAt: "2026-09-16T10:00:00+03:00",
  },
  {
    id: "demo-session-2",
    scenarioId: "demo-scenario-2",
    studentId: "demo-student-2",
    teacherId: "demo-teacher-1",
    status: "active",
    scheduledAt: "2026-09-15T14:00:00+03:00",
  },
  {
    id: "demo-session-3",
    scenarioId: "demo-scenario-3",
    studentId: "demo-student-1",
    teacherId: "demo-teacher-1",
    status: "completed",
    scheduledAt: "2026-09-14T10:00:00+03:00",
  },
  {
    id: "demo-session-4",
    scenarioId: "demo-scenario-1",
    studentId: "demo-student-2",
    teacherId: "demo-teacher-1",
    status: "completed",
    scheduledAt: "2026-09-14T11:00:00+03:00",
  },
];

export const demoResults: DemoTrainingResult[] = [
  {
    sessionId: "demo-session-3",
    criteria: [
      { name: "Сбор сведений", score: 28, maxScore: 30 },
      { name: "Заполнение карточки", score: 36, maxScore: 40 },
      { name: "Ведение диалога", score: 28, maxScore: 30 },
    ],
    comment:
      "Демонстрационная оценка: основные сведения собраны, в карточке есть небольшие неточности.",
  },
  {
    sessionId: "demo-session-4",
    criteria: [
      { name: "Сбор сведений", score: 24, maxScore: 30 },
      { name: "Заполнение карточки", score: 30, maxScore: 40 },
      { name: "Ведение диалога", score: 24, maxScore: 30 },
    ],
    comment:
      "Демонстрационная оценка: требуется более полное заполнение карточки обращения.",
  },
];

export const getResultScore = (result: DemoTrainingResult) =>
  result.criteria.reduce((total, criterion) => total + criterion.score, 0);

export const getResultMaxScore = (result: DemoTrainingResult) =>
  result.criteria.reduce((total, criterion) => total + criterion.maxScore, 0);

export type {
  DemoTrainingResult,
  DemoTrainingSession,
  TrainingStatus,
} from "../types/demoSessions";
