import type { CrewCallProgressProps } from "../types/crewCallProgress";

export function CrewCallProgress({ calls, enabled }: CrewCallProgressProps) {
  if (!enabled) return null;
  return (
    <div
      className="training-telephone__progress"
      aria-label="Оповещение бригад"
    >
      <p>
        Позвоните руководителю бригады, сообщите о задаче и дождитесь ответа
        «Принято».
      </p>
      <ul>
        {calls.map((call) => (
          <li key={call.crew_code}>
            <b>{call.name}</b> ·{" "}
            {call.completed
              ? "Оповещение подтверждено"
              : "Нужно передать задачу"}
          </li>
        ))}
      </ul>
    </div>
  );
}
