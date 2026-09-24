import {
  lessonKindLabels,
  lessonPercent,
  percentText,
} from "@/entities/training";
import { getTrainingResultPath } from "@/shared/config/routes";
import { rowAction } from "@/shared/lib/rowAction";
import { ToggleButton, ToggleButtonGroup } from "@mui/material";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type {
  PerformanceRingProps,
  StudentPerformanceProps,
} from "../types/StudentOverviewPanel";
const dateText = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("ru-RU", {
        timeZone: "Europe/Moscow",
        dateStyle: "short",
        timeStyle: "short",
      })
    : "Без срока";
function PerformanceRing({ value, title, description }: PerformanceRingProps) {
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
export function StudentPerformance({ data, own }: StudentPerformanceProps) {
  const navigate = useNavigate();
  const [track, setTrack] = useState("training");
  const { user, performance } = data;
  const selected = performance.tracks.find((item) => item.track === track)!;
  const resultPath = (lessonId: string) =>
    `${getTrainingResultPath(lessonId)}${own ? "" : `?student=${encodeURIComponent(user.id)}`}`;
  return (
    <section
      aria-labelledby="student-performance-title"
      className="student-performance"
    >
      <div className="student-section-heading">
        <h2 id="student-performance-title">Успеваемость</h2>
        <span>Средний результат урока</span>
      </div>
      <ToggleButtonGroup
        exclusive
        value={track}
        onChange={(_, value: string | null) => value && setTrack(value)}
        aria-label="Раздел успеваемости"
        size="small"
      >
        <ToggleButton value="training">Тренировки</ToggleButton>
        <ToggleButton value="assessment">Контрольные занятия</ToggleButton>
      </ToggleButtonGroup>
      <div className="student-performance-grid">
        <PerformanceRing
          value={selected.recent_percent}
          title="Текущая успеваемость"
          description={`Последние ${performance.recent_limit} оценённых уроков · учтено ${selected.recent_count}`}
        />
        <PerformanceRing
          value={selected.overall_percent}
          title="Общая успеваемость"
          description={`За всё время · оценено ${selected.graded_lessons}`}
        />
        <dl className="student-summary-counts">
          <div>
            <dt>Всего занятий</dt>
            <dd>{performance.total_lessons}</dd>
          </div>
          <div>
            <dt>Завершено всего</dt>
            <dd>{performance.completed_lessons}</dd>
          </div>
          <div>
            <dt>Оценено в разделе</dt>
            <dd>{selected.graded_lessons}</dd>
          </div>
        </dl>
      </div>
      <p className="student-performance-note">
        Тренировки и контрольные занятия учитываются раздельно. Оценки приведены
        к процентам. Каждый оценённый урок имеет одинаковый вес; учитывается
        последняя итоговая оценка.
        {!own && " Показаны занятия этого преподавателя."}
      </p>
      {selected.recent_lessons.length > 0 && (
        <div className="student-recent-table">
          <table aria-label="Последние результаты">
            <caption>Последние оценённые уроки</caption>
            <thead>
              <tr>
                <th>Урок</th>
                <th>Роль / вид занятия</th>
                <th>Завершение (МСК)</th>
                <th>Результат</th>
              </tr>
            </thead>
            <tbody>
              {selected.recent_lessons.map((row) => (
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
                  <td>
                    {row.role === "dds" ? "ДДС" : "Оператор 112"}
                    <small className="block-detail">
                      {lessonKindLabels[row.learning.kind]}
                    </small>
                  </td>
                  <td>{row.completed_at ? dateText(row.completed_at) : "—"}</td>
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
  );
}
