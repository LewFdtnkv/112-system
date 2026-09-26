import { lessonKindLabels } from "@/entities/training";
import {
  getStudentTrainingWorkspacePath,
  getTrainingResultPath,
} from "@/shared/config/routes";
import { PageControls } from "@/shared/ui/QueryState";
import { Link } from "react-router-dom";
import type { StudentActiveLessonsProps } from "../types/StudentOverviewPanel";
const dateText = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("ru-RU", {
        timeZone: "Europe/Moscow",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Без срока";
export function StudentActiveLessons({
  data,
  own,
  onPage,
  section,
}: StudentActiveLessonsProps) {
  const { user } = data;
  const active =
    section === "active" ? data.active_lessons : data.available_lessons;
  const heading =
    section === "active" ? "Активные занятия" : "Доступные занятия";
  if (!active) return null;
  const resultPath = (lessonId: string) =>
    `${getTrainingResultPath(lessonId)}${own ? "" : `?student=${encodeURIComponent(user.id)}`}`;
  return (
    <section
      className="student-active"
      aria-labelledby={`student-${section}-title`}
    >
      <div className="student-section-heading">
        <div>
          <h2 id={`student-${section}-title`}>
            {heading} <span>{active.total}</span>
          </h2>
          <p>
            {section === "active"
              ? "Занятия, которые выполняются сейчас."
              : "Начните новое занятие или продолжите после паузы."}
          </p>
        </div>
      </div>
      {active.items.length ? (
        <ul className="student-active-grid">
          {active.items.map((row) => (
            <li key={row.lesson_id}>
              <Link
                to={
                  own
                    ? getStudentTrainingWorkspacePath(row.lesson_id)
                    : resultPath(row.lesson_id)
                }
                className="student-active-card"
              >
                <strong
                  className={`student-operator-badge student-operator-badge--${row.role}`}
                >
                  {row.role === "dds" ? "Оператор ДДС" : "Оператор 112"}
                </strong>
                <span className="student-lesson-state">
                  {lessonKindLabels[row.learning.kind]}
                </span>
                <h3>{row.scenario_title}</h3>
                <p>{row.title}</p>
                <div className="student-lesson-progress">
                  <span>
                    Карточки: {row.completed_count} / {row.card_count}
                  </span>
                  <progress
                    aria-label={`Выполнение: ${row.scenario_title}`}
                    max={row.card_count || 1}
                    value={row.completed_count}
                  />
                </div>
                <small>
                  До: {dateText(row.deadline_at ?? row.available_until)}
                  {row.deadline_at || row.available_until ? " МСК" : ""}
                </small>
                <small>
                  {row.time_limit_seconds
                    ? `На занятие: ${row.time_limit_seconds / 60} мин с начала`
                    : "Без лимита минут · можно делать паузы"}
                </small>
                <strong className="student-lesson-action">
                  {own
                    ? row.work_status === "in_progress"
                      ? "Продолжить урок →"
                      : "Начать урок →"
                    : "Посмотреть работу →"}
                </strong>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="student-empty">
          {section === "active"
            ? "Сейчас нет выполняемых занятий."
            : "Сейчас нет доступных занятий."}
          {own ? " Будущие и завершённые занятия доступны в истории ниже." : ""}
        </p>
      )}
      {active.total > active.limit && (
        <PageControls
          total={active.total}
          page={Math.floor(active.offset / active.limit)}
          onPage={onPage}
          size={active.limit}
        />
      )}
    </section>
  );
}
