import { crewStatusLabels } from "@/entities/training";
import type { CrewResultsProps } from "../types/CrewResults";

export function CrewResults({ crews }: CrewResultsProps) {
  if (!crews.length) return null;
  return (
    <section className="crew-results" aria-label="Работа бригад">
      <h4>Назначенные бригады</h4>
      <div className="comparison-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Бригада</th>
              <th>Статус</th>
              <th>Наряд</th>
              <th>Комментарий и история</th>
            </tr>
          </thead>
          <tbody>
            {crews.map((c) => (
              <tr key={c.id}>
                <th scope="row">{c.name}</th>
                <td>{crewStatusLabels[c.status]}</td>
                <td>{c.crew_number || "—"}</td>
                <td>
                  <p>{c.comment}</p>
                  <details>
                    <summary>История действий ({c.history.length})</summary>
                    {c.history.map((e) => (
                      <p key={e.id}>
                        {new Date(e.at).toLocaleString("ru-RU", {
                          timeZone: "Europe/Moscow",
                        })}{" "}
                        МСК · {crewStatusLabels[e.status]} ·{" "}
                        {e.crew_number || "—"} · {e.comment}
                      </p>
                    ))}
                  </details>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
