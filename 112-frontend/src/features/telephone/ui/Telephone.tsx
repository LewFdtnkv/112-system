import {
  audioStatusLabels,
  callStatusLabels,
  stationModeLabels,
} from "@/entities/telephony";
import { getApiError } from "@/shared/api";
import { CrewCallProgress } from "./CrewCallProgress";
import { DialogueStatus } from "./DialogueStatus";
import { useTelephone } from "../model/useTelephone";
import type { TelephoneProps } from "../types/telephone";
import "../styles/telephone.scss";
export function Telephone(props: TelephoneProps) {
  const { query, phone, binding, start, control, active, busy, error } =
    useTelephone(props);
  const data = query.data;
  if (query.error && !data)
    return (
      <section className="training-telephone" role="alert">
        Не удалось загрузить учебный телефон.{" "}
        <button
          className="arm-small-button"
          onClick={() => void query.refetch()}
        >
          Повторить
        </button>
      </section>
    );
  if (!data) return null;
  if (!data.enabled)
    return data.crew_calls_required ? (
      <section className="training-telephone" role="status">
        В этом задании нужно оповестить бригаду по телефону. Телефония отключена
        — обратитесь к преподавателю.
      </section>
    ) : null;
  const station = data.station;
  const bound = station?.enabled && station.attempt_id === props.attemptId;
  const ready =
    bound && (station.mode !== "browser" || phone.state === "ready");
  return (
    <section
      className="training-telephone"
      aria-label="Учебный телефон"
      data-learning-target="telephone"
    >
      <div className="training-telephone__heading">
        <b>Учебный телефон</b>
        <span>
          {station
            ? `${station.name} · ${stationModeLabels[station.mode]}`
            : "Рабочее место не назначено"}
        </span>
      </div>
      <CrewCallProgress
        calls={data.crew_calls ?? []}
        enabled={!!data.crew_calls_required}
      />
      {!props.completed &&
        station?.enabled &&
        (!bound ||
          (station.mode === "browser" && phone.state === "offline")) && (
          <button
            className="arm-small-button"
            disabled={
              busy ||
              !!active ||
              (station.mode !== "external" && !station.provisioned)
            }
            onClick={() => binding.mutate()}
          >
            {station.mode === "browser"
              ? "Подключить гарнитуру"
              : "Подключить рабочее место"}
          </button>
        )}
      {station?.mode !== "external" && station && !station.provisioned && (
        <p>Рабочее место настраивается на АТС. {station.error}</p>
      )}
      {!station && !props.completed && (
        <p>
          Обратитесь к администратору для назначения телефона или гарнитуры.
        </p>
      )}
      {phone.state === "connecting" && <p role="status">Подключение к АТС…</p>}
      {phone.state === "incoming" && (
        <div className="training-telephone__incoming" role="alert">
          <b>Входящий учебный звонок</b>
          <button
            className="arm-small-button"
            disabled={busy}
            onClick={() => control.mutate("accept")}
          >
            Принять
          </button>
          <button
            className="arm-small-button"
            disabled={busy}
            onClick={() => control.mutate("hangup")}
          >
            Отклонить
          </button>
        </div>
      )}
      {active && (
        <div role="status" className="training-telephone__active">
          <b>
            {active.contact_name} · {callStatusLabels[active.status]}
          </b>
          <DialogueStatus phase={active.dialogue?.phase} />
          {active.attempt_id !== props.attemptId && (
            <span>Звонок относится к другой карточке занятия.</span>
          )}
          {active.status === "dialing" &&
            station?.mode === "phone" &&
            active.transport === "manual" && (
              <span>Наберите 9000 на закреплённом телефоне</span>
            )}
          {station?.mode === "external" ? (
            <>
              <span>
                Наберите учебный контакт на телефоне. Состояние поступает от
                адаптера АТС.
              </span>
              {!active.provider_confirmed && (
                <button
                  className="arm-small-button"
                  disabled={busy}
                  onClick={() => control.mutate("hangup")}
                >
                  Отменить выбор
                </button>
              )}
            </>
          ) : (
            <button
              className="arm-small-button"
              disabled={busy || active.cancel_requested}
              onClick={() => control.mutate("hangup")}
            >
              {active.cancel_requested ? "Завершение…" : "Завершить звонок"}
            </button>
          )}
        </div>
      )}
      {phone.mutedPlayback && (
        <button
          className="arm-small-button"
          onClick={() => control.mutate("play")}
        >
          Включить звук разговора
        </button>
      )}
      {!props.completed && !active && (
        <ul className="training-telephone__contacts">
          {data.cues.map((cue) => (
            <li key={`${cue.id}:${cue.crew_code ?? ""}`}>
              <span>
                {cue.crew_name ? `${cue.crew_name} · ${cue.name}` : cue.name}
                <small>{audioStatusLabels[cue.status]}</small>
              </span>
              <button
                className="arm-small-button"
                disabled={
                  !ready ||
                  busy ||
                  (station?.mode !== "external" && cue.status !== "ready")
                }
                onClick={() =>
                  start.mutate({
                    cue_id: cue.id,
                    crew_code: cue.crew_code,
                    direction: "outgoing",
                    transport: "manual",
                  })
                }
              >
                {station?.mode === "browser" ? "Позвонить" : "Выбрать контакт"}
              </button>
              {station?.mode !== "external" && !data.crew_calls_required && (
                <button
                  className="arm-small-button"
                  disabled={!ready || busy || cue.status !== "ready"}
                  onClick={() =>
                    start.mutate({
                      cue_id: cue.id,
                      crew_code: cue.crew_code,
                      direction: "incoming",
                      transport: "callback",
                    })
                  }
                >
                  Вызвать меня
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!props.completed && data.cues.length === 0 && (
        <p>
          {data.crew_calls_required
            ? "Назначьте бригаду в нижней панели — здесь появится её руководитель для звонка."
            : "Для карточки ещё нет телефонных сообщений. Их подготовит преподаватель."}
        </p>
      )}
      {data.calls.length > 0 && (
        <details>
          <summary>Журнал звонков ({data.calls.length})</summary>
          <ul>
            {data.calls.map((call) => (
              <li key={call.id}>
                {new Date(call.started_at).toLocaleTimeString("ru-RU")} ·{" "}
                {call.contact_name} · {callStatusLabels[call.status]}
                {call.result && <small>{call.result}</small>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {(error || phone.error) && (
        <p role="alert">{phone.error || getApiError(error).message}</p>
      )}
    </section>
  );
}
