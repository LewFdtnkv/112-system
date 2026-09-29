import type { JobStatsProps } from "../types";
export function JobStats({ summary: s }: JobStatsProps) {
  return (
    <section className="ai-jobs__stats" aria-label="Статистика ИИ-задач">
      <article>
        <span>В очереди</span>
        <strong>{s.queued}</strong>
        <small>Ожидают запуска</small>
      </article>
      <article>
        <span>В работе</span>
        <strong>{s.running}</strong>
        <small>Выполняются сейчас</small>
      </article>
      <article>
        <span>Завершено</span>
        <strong>{s.succeeded + s.failed}</strong>
        <small>
          {s.succeeded} успешно · {s.failed} с ошибкой
        </small>
      </article>
    </section>
  );
}
