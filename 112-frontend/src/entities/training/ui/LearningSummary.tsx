import {
  assistanceLabels,
  learningSkillLabels,
  lessonKindLabels,
} from "../model/learning";
import type { LearningSummaryProps } from "../types/learning";
import "../styles/learning.scss";

export function LearningSummary({ policy, result }: LearningSummaryProps) {
  return (
    <section className="learning-summary" aria-label="Условия обучения">
      <h3>{lessonKindLabels[policy.kind]}</h3>
      {policy.objective && <p>{policy.objective}</p>}
      <p>
        {policy.assistance.mode === "none"
          ? "Самостоятельное выполнение · без учебных подсказок"
          : `${assistanceLabels[policy.assistance.mode]} запланированы. Выдача подсказок пока недоступна.`}
      </p>
      {policy.target_skills.length > 0 && (
        <ul className="learning-skills" aria-label="Целевые навыки">
          {policy.target_skills.map((skill) => (
            <li key={skill}>{learningSkillLabels[skill]}</li>
          ))}
        </ul>
      )}
      <small>
        {policy.kind === "assessment"
          ? "Результат учитывается отдельно в контрольных занятиях."
          : "Учебная работа. Результат не смешивается с контрольными занятиями."}
      </small>
      {result && (
        <dl className="learning-measures">
          {(
            [
              ["correctness", "Правильность решения"],
              ["independence", "Самостоятельность"],
              ["interface", "Владение интерфейсом"],
              ["duration", "Время выполнения"],
            ] as const
          ).map(([key, label]) => {
            const measure = result[key];
            return (
              <div key={key}>
                <dt>{label}</dt>
                <dd>
                  {measure.status === "available" && measure.value !== null
                    ? `${measure.value}${measure.unit === "seconds" ? " с" : "%"}`
                    : measure.status === "pending"
                      ? "Ожидает результата"
                      : "Не оценивалось"}
                </dd>
                <small>{measure.explanation}</small>
              </div>
            );
          })}
        </dl>
      )}
    </section>
  );
}
