import {
  countFilledFields,
  getCategoryName,
  incidentCategories,
  totalCardFields,
  type IncidentCardFields,
} from "@/entities/incident-card";

import type {
  CriterionScore,
  Evaluation,
} from "../demoEvaluations/types/demoEvaluationsTypes";

interface EvaluateIncidentCardInput {
  sessionId: string;
  fields: IncidentCardFields;
  actionLog: readonly string[];
  elapsedSeconds: number;
  normSeconds: number;
}

const criterion = (
  key: CriterionScore["key"],
  score: number,
  maxScore: number,
  findings: readonly string[] = [],
): CriterionScore => ({ key, score, maxScore, findings });

const hasAddressDetails = (fields: IncidentCardFields) =>
  [
    fields.address.district,
    fields.address.area,
    fields.address.street,
    fields.address.house,
  ].every((value) => value.trim().length > 0);

export const evaluateIncidentCard = ({
  sessionId,
  fields,
  actionLog,
  elapsedSeconds,
  normSeconds,
}: EvaluateIncidentCardInput): Evaluation => {
  const selectedCategory = incidentCategories.find(
    (category) => category.id === fields.categoryId,
  );
  const addressIsComplete = hasAddressDetails(fields);
  const expectedServices = selectedCategory?.defaultServices ?? [];
  const routingIsCorrect = expectedServices.every((service) =>
    fields.services.includes(service),
  );
  const textIsDetailed = fields.description.trim().length >= 20;
  const protocolObserved = actionLog.some((entry) =>
    entry.startsWith("Оператор: "),
  );
  const timingDeltaSeconds = Math.max(0, elapsedSeconds - normSeconds);
  const grammarIssues = /\s{2,}|[!?]{2,}/.test(
    `${fields.description} ${fields.operatorAction}`,
  )
    ? [
        {
          field: "description" as const,
          message: "Проверьте лишние пробелы и повторяющиеся знаки препинания.",
        },
      ]
    : [];
  const criteria = [
    criterion(
      "field_accuracy",
      addressIsComplete ? 20 : 12,
      20,
      addressIsComplete
        ? []
        : ["Для точной привязки заполните округ и район происшествия."],
    ),
    criterion(
      "text_relevance",
      textIsDetailed ? 15 : 8,
      15,
      textIsDetailed ? [] : ["Добавьте больше деталей в сообщение заявителя."],
    ),
    criterion(
      "completeness",
      Math.round((countFilledFields(fields) / totalCardFields) * 10),
      10,
    ),
    criterion(
      "routing",
      routingIsCorrect ? 15 : 7,
      15,
      routingIsCorrect
        ? []
        : [
            `Проверьте службы для категории «${getCategoryName(fields.categoryId)}».`,
          ],
    ),
    criterion(
      "timing",
      Math.max(5, 15 - Math.ceil(timingDeltaSeconds / 10)),
      15,
      timingDeltaSeconds > 0
        ? [`Превышение норматива на ${timingDeltaSeconds} с.`]
        : [],
    ),
    criterion(
      "grammar",
      grammarIssues.length === 0 ? 10 : 7,
      10,
      grammarIssues.map((issue) => issue.message),
    ),
    criterion(
      "protocol",
      protocolObserved ? 15 : 0,
      15,
      protocolObserved
        ? []
        : ["Не найдено зафиксированное действие оператора."],
    ),
  ];
  const totalScore = criteria.reduce((sum, item) => sum + item.score, 0);

  return {
    id: `evaluation-${sessionId}`,
    sessionId,
    criteria,
    grammarIssues,
    timingDeltaSeconds,
    totalScore,
    maxScore: 100,
    passed: totalScore >= 70,
    source: "auto",
    expertComment:
      totalScore >= 85
        ? "Карточка оформлена уверенно. Проверьте детали перед передачей в работу."
        : "Результат сформирован автоматически. Посмотрите замечания по критериям.",
    evaluatedAt: new Date().toISOString(),
  };
};
