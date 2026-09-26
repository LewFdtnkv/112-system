import { Alert, Button } from "@mui/material";
import { crewStatusLabels } from "@/entities/training";
import type { CardDetailsProps } from "../types/CardSections";
import { useDDSProfile } from "../model/useDDSProfile";

export function CardDDSDetails({ card }: Pick<CardDetailsProps, "card">) {
  const exercise = card.dds_exercise;
  const profile = useDDSProfile(exercise?.service_profile_id);
  if (!exercise)
    return (
      <p>
        Упражнение ДДС не настроено. Для использования в новом сценарии ДДС
        укажите профиль службы, бригады и учебные цели в редакторе карточки.
      </p>
    );
  const codes = [
    ...new Set([
      ...exercise.initial_crews.map((c) => c.crew_code),
      ...exercise.required_crews.map((c) => c.crew_code),
      ...exercise.messages.map((c) => c.crew_code),
    ]),
  ];
  return (
    <div className="card-dds-review">
      <p>
        <b>Профиль службы: </b>
        {profile.data?.name ??
          (profile.isPending ? "Загрузка…" : "Название недоступно")}
      </p>
      {profile.error && (
        <Alert severity="error">
          Не удалось загрузить названия бригад.{" "}
          <Button onClick={() => void profile.refetch()}>Повторить</Button>
        </Alert>
      )}
      <p>
        <b>Звонок при новом назначении: </b>
        {exercise.crew_calls_required ? "Обязателен" : "Не требуется"}
      </p>
      <p className="template-explanation">
        Исходная история уже выполнена предыдущей сменой и не приносит баллы.
        Новые сообщения появятся у бригад; статусы по ним ученик внесёт сам.
      </p>
      {codes.map((code) => {
        const history =
          exercise.initial_crews.find((c) => c.crew_code === code)?.history ??
          [];
        const goal = exercise.required_crews.find((c) => c.crew_code === code);
        const messages = exercise.messages.filter((m) => m.crew_code === code);
        return (
          <article key={code}>
            <h4>
              {profile.data?.crews?.find((c) => c.code === code)?.name ?? code}
            </h4>
            <b>Исходная история до начала работы ученика</b>
            {history.length ? (
              <ol>
                {history.map((event, index) => (
                  <li key={index}>
                    <strong>
                      {crewStatusLabels[event.status] ?? event.status}
                    </strong>
                    {" · "}
                    {event.seconds_before_start
                      ? `За ${event.seconds_before_start} с до поступления`
                      : "При поступлении карточки"}
                    {event.crew_number && (
                      <p>Номер наряда: {event.crew_number}</p>
                    )}
                    {event.comment && <p>{event.comment}</p>}
                  </li>
                ))}
              </ol>
            ) : (
              <p>Бригада ещё не назначена.</p>
            )}
            <b>Новые сообщения для оператора ДДС</b>
            {messages.length ? (
              messages.map((m, index) => <p key={index}>{m.message}</p>)
            ) : (
              <p>Новых сообщений нет.</p>
            )}
            <p>
              <b>Учебная цель: </b>
              {goal
                ? (crewStatusLabels[goal.status] ?? goal.status)
                : "Нет — только исходная история"}
            </p>
          </article>
        );
      })}
    </div>
  );
}
