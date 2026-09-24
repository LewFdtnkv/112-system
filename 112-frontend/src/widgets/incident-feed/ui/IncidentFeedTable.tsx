import {
  formatAddress,
  getCategoryName,
  incidentStatusLabels,
} from "@/entities/incident-card";
import { rowAction } from "@/shared/lib/rowAction";
import { ArmIcon, ArmIconButton } from "@/shared/ui/arm";
import { Fragment } from "react";
import { styles } from "../styles/IncidentFeed";
import type { IncidentFeedTableProps } from "../types/IncidentFeedTable";
export function IncidentFeedTable({
  incidents,
  selectedId,
  timing,
  workflowStatus,
  descending,
  hiddenDescriptions,
  onOpen,
  onSortToggle,
  onDescriptionToggle,
}: IncidentFeedTableProps) {
  return (
    <div className="arm-journal-table-scroll">
      <table
        className={`arm-journal-table${timing ? " arm-journal-table--stream" : ""}`}
        aria-label="Список происшествий"
      >
        <colgroup>
          {[32, 30, 32, 32, timing ? 64 : 32, 54, 44, 76, 76, 80].map(
            (width, index) => (
              <col key={index} style={styles.col(width)} />
            ),
          )}
          <col style={timing ? styles.col(130) : undefined} />
          <col style={styles.col2} />
          <col className="arm-journal-table__address-col" />
          <col style={styles.col3} />
          <col style={styles.col4} />
        </colgroup>
        <thead>
          <tr>
            <th />
            <th colSpan={2}>Связи</th>
            <th>ЧС</th>
            <th />
            <th>Опер.</th>
            <th>АРМ</th>
            <th>Номер</th>
            <th>
              <button onClick={onSortToggle}>
                Дата <ArmIcon name={descending ? "down" : "up"} />
              </button>
            </th>
            <th>Время</th>
            <th>Тип происшествия</th>
            <th>Постр.</th>
            <th>Адрес</th>
            <th>Статус карточки</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {incidents.map((incident) => (
            <Fragment key={incident.id}>
              <tr
                {...rowAction(() => onOpen(incident))}
                className={
                  selectedId === incident.id
                    ? "table-clickable-row is-selected"
                    : "table-clickable-row"
                }
                tabIndex={0}
                aria-label={`Карточка ${incident.id}`}
              >
                <td>
                  <ArmIconButton
                    icon={
                      hiddenDescriptions.includes(incident.id)
                        ? "right"
                        : "down"
                    }
                    label={`Описание карточки ${incident.id}`}
                    aria-expanded={!hiddenDescriptions.includes(incident.id)}
                    onClick={(event) => {
                      event.stopPropagation();
                      onDescriptionToggle(incident.id);
                    }}
                  />
                </td>
                <td />
                <td>
                  <ArmIcon name="bookmark" />
                </td>
                <td>
                  <ArmIcon name="bolt" />
                </td>
                <td>{timing ? timing(incident) : <ArmIcon name="timer" />}</td>
                <td className="arm-journal-table__operator">
                  {incident.operatorNumber ?? "—"}
                </td>
                <td>{incident.workstation ?? "—"}</td>
                <td>{incident.displayNumber ?? incident.id}</td>
                <td>
                  {incident.createdDate?.replace(/\.20(\d{2})$/, ".$1") ?? "—"}
                </td>
                <td className="arm-journal-table__time">
                  {incident.createdAt}
                </td>
                <td className="arm-journal-table__category">
                  {incident.categoryName ??
                    getCategoryName(incident.fields.categoryId)}
                </td>
                <td>{incident.fields.victimsCount || "Нет"}</td>
                <td className="arm-journal-table__address">
                  {formatAddress(incident.fields.address)}
                  <span>
                    <ArmIcon name="pin" />
                  </span>
                </td>
                <td>
                  {workflowStatus
                    ? workflowStatus(incident)
                    : incidentStatusLabels[incident.fields.status]}
                </td>
                <td>
                  <ArmIconButton
                    icon="clipboard"
                    label={`Открыть карточку ${incident.id}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpen(incident);
                    }}
                  />
                </td>
              </tr>
              {!hiddenDescriptions.includes(incident.id) && (
                <tr className="arm-journal-description">
                  <td colSpan={15}>
                    <span>Описание:</span>
                    <span>
                      {incident.createdDate} {incident.createdAt} / УМЦ —{" "}
                    </span>
                    {incident.fields.description || "Описание не заполнено"}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {!incidents.length && (
            <tr>
              <td colSpan={15}>Карточки по заданным параметрам не найдены.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
