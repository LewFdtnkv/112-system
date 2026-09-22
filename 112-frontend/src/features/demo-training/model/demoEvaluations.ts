import type { Evaluation } from "./evaluation";

export const demoEvaluations: readonly Evaluation[] = [
  {
    id: "demo-evaluation-3",
    sessionId: "demo-session-3",
    criteria: [
      {
        key: "field_accuracy",
        score: 18,
        maxScore: 20,
        findings: ["Округ указан верно, адрес совпадает с эталоном."],
      },
      {
        key: "text_relevance",
        score: 14,
        maxScore: 15,
        findings: [],
      },
      {
        key: "completeness",
        score: 10,
        maxScore: 10,
        findings: [],
      },
      {
        key: "routing",
        score: 14,
        maxScore: 15,
        findings: ["Служба 104 выбрана верно."],
      },
      {
        key: "timing",
        score: 13,
        maxScore: 15,
        findings: ["Превышение норматива на 8 секунд."],
      },
      {
        key: "grammar",
        score: 9,
        maxScore: 10,
        findings: ["Одна опечатка в описании."],
      },
      {
        key: "protocol",
        score: 14,
        maxScore: 15,
        findings: [],
      },
    ],
    grammarIssues: [
      { field: "description", message: "Опечатка: «водоснабжени»." },
    ],
    timingDeltaSeconds: 8,
    totalScore: 92,
    maxScore: 100,
    passed: true,
    source: "auto",
    expertComment:
      "Демонстрационная оценка: основные сведения собраны, в карточке есть небольшие неточности.",
    evaluatedAt: "2026-09-14T10:24:00+03:00",
  },
  {
    id: "demo-evaluation-4",
    sessionId: "demo-session-4",
    criteria: [
      {
        key: "field_accuracy",
        score: 14,
        maxScore: 20,
        findings: ["Адрес указан неточно, не совпадает с эталоном."],
      },
      {
        key: "text_relevance",
        score: 11,
        maxScore: 15,
        findings: ["Не упомянут статус пострадавших."],
      },
      {
        key: "completeness",
        score: 7,
        maxScore: 10,
        findings: ["Поле «Заявитель» не заполнено."],
      },
      {
        key: "routing",
        score: 10,
        maxScore: 15,
        findings: ["Не выбрана служба 101 при возгорании."],
      },
      {
        key: "timing",
        score: 10,
        maxScore: 15,
        findings: ["Превышение норматива на 22 секунды."],
      },
      {
        key: "grammar",
        score: 8,
        maxScore: 10,
        findings: ["Две опечатки в сообщении."],
      },
      {
        key: "protocol",
        score: 12,
        maxScore: 15,
        findings: ["Действие оператора зафиксировано с задержкой."],
      },
    ],
    grammarIssues: [
      { field: "description", message: "Опечатка: «падение»." },
      { field: "operatorAction", message: "Пропущена запятая." },
    ],
    timingDeltaSeconds: 22,
    totalScore: 72,
    maxScore: 100,
    passed: true,
    source: "auto",
    expertComment:
      "Демонстрационная оценка: требуется более полное заполнение карточки обращения.",
    evaluatedAt: "2026-09-14T11:31:00+03:00",
  },
];
