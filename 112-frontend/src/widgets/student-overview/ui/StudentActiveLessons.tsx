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
}: StudentActiveLessonsProps) {
  const { user, active_lessons: active } = data;
  const resultPath = (lessonId: string) =>
    `${getTrainingResultPath(lessonId)}${own ? "" : `?student=${encodeURIComponent(user.id)}`}`;
  return (
    <section className="student-active" aria-labelledby="student-active-title">
      <div className="student-section-heading">
        <div>
          <h2 id="student-active-title">
            Активные уроки <span>{active.total}</span>
          </h2>
          <p>
            {own
              ? "Продолжите начатое занятие или приступите к новому."
              : "Доступные и незаконченные занятия ученика."}
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
                <span className="student-lesson-state">
                  {row.work_status === "in_progress"
                    ? "В процессе"
                    : "Можно начать"}{" "}
                  · {row.role === "dds" ? "ДДС" : "Оператор 112"} ·{" "}
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
                  Срок: {dateText(row.available_until)}
                  {row.available_until ? " МСК" : ""}
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
          Сейчас нет активных уроков.
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
