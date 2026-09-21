import { rowAction } from "@/shared/lib/rowAction";
import { Link, useNavigate } from "react-router-dom";
import {
  UserPhoto,
  userName,
  percentText,
  lessonPercent,
  type StudentOverview,
} from "@/entities/training";
import {
  getStudentTrainingWorkspacePath,
  getTrainingResultPath,
} from "@/shared/config/routes";
import { PageControls } from "@/shared/ui/QueryState";
import "./student-overview.scss";

const dateText = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("ru-RU", {
        timeZone: "Europe/Moscow",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Без срока";
function PerformanceRing({
  value,
  title,
  description,
}: {
  value: number | null;
  title: string;
  description: string;
}) {
  return (
    <article className="student-performance-card">
      <div
        className="student-performance-ring"
        role="img"
        aria-label={`${title}: ${percentText(value)}`}
      >
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="49" className="student-ring-track" />
          {value !== null && (
            <circle
              cx="60"
              cy="60"
              r="49"
              pathLength="100"
              className="student-ring-value"
              strokeDasharray={`${Math.max(0, Math.min(100, value))} 100`}
              transform="rotate(-90 60 60)"
            />
          )}
        </svg>
        <strong>{value === null ? "—" : percentText(value)}</strong>
      </div>
      <div>
        <h3>{title}</h3>
        <p>{description}</p>
        {value === null && <small>Оценок пока нет</small>}
      </div>
    </article>
  );
}
export function StudentOverviewPanel({
  data,
  own = false,
  onActivePage,
}: {
  data: StudentOverview;
  own?: boolean;
  onActivePage: (page: number) => void;
}) {
  const { user, groups, performance: p, active_lessons: active } = data;
  const navigate = useNavigate();
  const resultPath = (lesson: string) =>
    `${getTrainingResultPath(lesson)}${own ? "" : `?student=${encodeURIComponent(user.id)}`}`;
  return (
    <div className="student-overview">
      <section className="student-identity" aria-label="Данные ученика">
        <UserPhoto userId={user.id} />
        <div>
          <h2>{userName(user)}</h2>
          <p>
            {user.username}
            {user.email ? ` · ${user.email}` : ""}
          </p>
          <p>{groups.length ? groups.join(" · ") : "Без учебной группы"}</p>
        </div>
        <span className="student-identity-role">Ученик</span>
      </section>
      <section
        className="student-active"
        aria-labelledby="student-active-title"
      >
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
                    · {row.role === "dds" ? "ДДС" : "Оператор 112"}
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
            {own
              ? " Будущие и завершённые занятия доступны в истории ниже."
              : ""}
          </p>
        )}
        {active.total > active.limit && (
          <PageControls
            total={active.total}
            page={Math.floor(active.offset / active.limit)}
            onPage={onActivePage}
            size={active.limit}
          />
        )}
      </section>
      <section
        aria-labelledby="student-performance-title"
        className="student-performance"
      >
        <div className="student-section-heading">
          <h2 id="student-performance-title">Успеваемость</h2>
          <span>Средний результат урока</span>
        </div>
        <div className="student-performance-grid">
          <PerformanceRing
            value={p.recent_percent}
            title="Текущая успеваемость"
            description={`Последние ${p.recent_limit} оценённых уроков · учтено ${p.recent_count}`}
          />
          <PerformanceRing
            value={p.overall_percent}
            title="Общая успеваемость"
            description={`За всё время · оценено ${p.graded_lessons}`}
          />
          <dl className="student-summary-counts">
            <div>
              <dt>Всего уроков</dt>
              <dd>{p.total_lessons}</dd>
            </div>
            <div>
              <dt>Завершено</dt>
              <dd>{p.completed_lessons}</dd>
            </div>
            <div>
              <dt>Оценено</dt>
              <dd>{p.graded_lessons}</dd>
            </div>
          </dl>
        </div>
        <p className="student-performance-note">
          Оценки приведены к процентам. Каждый оценённый урок имеет одинаковый
          вес; учитывается последняя итоговая оценка.
          {!own && " Показаны занятия этого преподавателя."}
        </p>
        {p.recent_lessons.length > 0 && (
          <div className="student-recent-table">
            <table aria-label="Последние результаты">
              <caption>Последние оценённые уроки</caption>
              <thead>
                <tr>
                  <th>Урок</th>
                  <th>Тип занятия</th>
                  <th>Завершение (МСК)</th>
                  <th>Результат</th>
                </tr>
              </thead>
              <tbody>
                {p.recent_lessons.map((row) => (
                  <tr
                    key={row.lesson_id}
                    {...rowAction(() => navigate(resultPath(row.lesson_id)))}
                  >
                    <td>
                      <Link
                        className="student-recent-link"
                        to={resultPath(row.lesson_id)}
                      >
                        {row.scenario_title}
                      </Link>
                      <small className="block-detail">{row.title}</small>
                    </td>
                    <td>{row.role === "dds" ? "ДДС" : "Оператор 112"}</td>
                    <td>
                      {row.completed_at ? dateText(row.completed_at) : "—"}
                    </td>
                    <td>
                      <strong>{percentText(lessonPercent(row))}</strong>
                      <small className="block-detail">
                        {row.evaluation_method === "teacher"
                          ? "Преподаватель"
                          : "Автоматически"}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
