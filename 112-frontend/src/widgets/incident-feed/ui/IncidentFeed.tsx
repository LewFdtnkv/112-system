import {
  formatAddress,
  getCategoryName,
  incidentStatusLabels,
  type IncidentCard,
} from "@/entities/incident-card";
import { rowAction } from "@/shared/lib/rowAction";
import { ArmField, ArmIcon, ArmIconButton } from "@/shared/ui/arm";
import { Fragment, useMemo, useState } from "react";
import "../styles/incident-feed.scss";
import { styles } from "../styles/IncidentFeed";
import type { IncidentFeedProps } from "../types/IncidentFeed";
import { JournalClock } from "./JournalClock";
const emptyFilters = { query: "", address: "", district: "", status: "" };
const sortKey = (card: IncidentCard) =>
  `${card.createdDate?.split(".").reverse().join("-") ?? ""} ${card.createdAt}`;
const normalize = (value: string) => value.toLocaleLowerCase("ru-RU").trim();
export function IncidentFeed({
  toolbar,
  timing,
  workflowStatus,
  incidents,
  selectedId,
  onOpen,
}: IncidentFeedProps) {
  const [filters, setFilters] = useState(emptyFilters);
  const [applied, setApplied] = useState(emptyFilters);
  const [advanced, setAdvanced] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hiddenDescriptions, setHiddenDescriptions] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [notifications, setNotifications] = useState(false);
  const [descending, setDescending] = useState(true);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const filtered = useMemo(
    () =>
      incidents
        .filter((incident) => {
          const { fields } = incident;
          const address = formatAddress(fields.address);
          const text = [
            incident.id,
            incident.categoryName ?? getCategoryName(fields.categoryId),
            address,
            fields.description,
            fields.callerName,
            ...Object.values(fields.phones),
          ].join(" ");
          return (
            (!applied.query ||
              normalize(text).includes(normalize(applied.query))) &&
            (!applied.address ||
              normalize(address).includes(normalize(applied.address))) &&
            (!applied.district ||
              normalize(fields.address.district).includes(
                normalize(applied.district),
              )) &&
            (!applied.status ||
              normalize(incidentStatusLabels[fields.status]).includes(
                normalize(applied.status),
              )) &&
            (!status || fields.status === status) &&
            (!notifications || fields.status === "not_notified")
          );
        })
        .sort(
          (a, b) =>
            (descending ? -1 : 1) * sortKey(a).localeCompare(sortKey(b)),
        ),
    [incidents, applied, status, notifications, descending],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pages - 1);
  const shown = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);
  const reset = () => {
    setFilters(emptyFilters);
    setApplied(emptyFilters);
    setStatus("");
    setNotifications(false);
    setPage(0);
  };
  return (
    <>
      <div className="arm-journal-header">
        <section className="arm-journal-search" aria-label="Поиск происшествий">
          <h1 className="visually-hidden">Поиск происшествий</h1>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setApplied(filters);
              setPage(0);
            }}
          >
            <div className="arm-journal-search__line">
              <input
                aria-label="Поиск происшествий"
                placeholder="Поиск происшествий"
                value={filters.query}
                onChange={(e) =>
                  setFilters({ ...filters, query: e.target.value })
                }
              />
              <ArmIconButton
                icon="search"
                label="Искать по параметрам"
                type="submit"
              />
            </div>
            <div className="arm-journal-search__controls">
              <button
                type="button"
                aria-expanded={advanced}
                onClick={() => setAdvanced(!advanced)}
              >
                расширенный по параметрам{" "}
                <ArmIcon name={advanced ? "up" : "down"} />
              </button>
              <button
                className="arm-small-button"
                type="button"
                onClick={reset}
              >
                сбросить
              </button>
            </div>
            {advanced && (
              <div className="arm-journal-search__advanced">
                {(
                  [
                    ["address", "По адресу"],
                    ["district", "По округу"],
                    ["status", "Статус"],
                  ] as const
                ).map(([key, label]) => (
                  <ArmField
                    key={key}
                    label={label}
                    value={filters[key]}
                    onChange={(e) =>
                      setFilters({ ...filters, [key]: e.target.value })
                    }
                  />
                ))}
              </div>
            )}
          </form>
        </section>
        <aside className="arm-journal-utility">
          <JournalClock />
          {toolbar}
        </aside>
      </div>
      <section
        className="arm-journal-list"
        aria-labelledby="incident-list-title"
      >
        <header className="arm-journal-list__heading">
          <h2 id="incident-list-title">
            <button
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
            >
              Список происшествий <ArmIcon name={collapsed ? "down" : "up"} />
            </button>
          </h2>
          <label className="arm-notifications">
            <input
              type="checkbox"
              checked={notifications}
              onChange={(e) => {
                setNotifications(e.target.checked);
                setPage(0);
              }}
            />
            <ArmIcon name="comment" />
            уведомления
          </label>
          <select
            aria-label="Какие карточки показать"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(0);
            }}
          >
            <option value="">выберите что показать</option>
            {Object.entries(incidentStatusLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </header>
        {!collapsed && (
          <>
            <div className="arm-journal-table-scroll">
              <table
                className={`arm-journal-table${timing ? " arm-journal-table--stream" : ""}`}
                aria-label="Список происшествий"
              >
                <colgroup>
                  {[32, 30, 32, 32, timing ? 64 : 32, 54, 44, 76, 76, 80].map(
                    (width, i) => (
                      <col key={i} style={styles.col(width)} />
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
                    <th></th>
                    <th colSpan={2}>Связи</th>
                    <th>ЧС</th>
                    <th></th>
                    <th>Опер.</th>
                    <th>АРМ</th>
                    <th>Номер</th>
                    <th>
                      <button onClick={() => setDescending(!descending)}>
                        Дата <ArmIcon name={descending ? "down" : "up"} />
                      </button>
                    </th>
                    <th>Время</th>
                    <th>Тип происшествия</th>
                    <th>Постр.</th>
                    <th>Адрес</th>
                    <th>Статус карточки</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((incident) => (
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
                            aria-expanded={
                              !hiddenDescriptions.includes(incident.id)
                            }
                            onClick={(e) => {
                              e.stopPropagation();
                              setHiddenDescriptions((current) =>
                                current.includes(incident.id)
                                  ? current.filter((id) => id !== incident.id)
                                  : [...current, incident.id],
                              );
                            }}
                          />
                        </td>
                        <td></td>
                        <td>
                          <ArmIcon name="bookmark" />
                        </td>
                        <td>
                          <ArmIcon name="bolt" />
                        </td>
                        <td>
                          {timing ? timing(incident) : <ArmIcon name="timer" />}
                        </td>
                        <td className="arm-journal-table__operator">
                          {incident.operatorNumber ?? "—"}
                        </td>
                        <td>{incident.workstation ?? "—"}</td>
                        <td>{incident.displayNumber ?? incident.id}</td>
                        <td>
                          {incident.createdDate?.replace(
                            /\.20(\d{2})$/,
                            ".$1",
                          ) ?? "—"}
                        </td>
                        <td className="arm-journal-table__time">
                          {incident.createdAt}
                        </td>
                        <td className="arm-journal-table__category">
                          {incident.categoryName ??
                            getCategoryName(incident.fields.categoryId)}
                        </td>
                        <td>
                          {incident.fields.victimsCount
                            ? incident.fields.victimsCount
                            : "Нет"}
                        </td>
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
                            onClick={(e) => {
                              e.stopPropagation();
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
                              {incident.createdDate} {incident.createdAt} / УМЦ
                              —{" "}
                            </span>
                            {incident.fields.description ||
                              "Описание не заполнено"}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  {!shown.length && (
                    <tr>
                      <td colSpan={15}>
                        Карточки по заданным параметрам не найдены.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="arm-journal-pagination">
              <label>
                Страница:{" "}
                <select
                  aria-label="Страница"
                  value={safePage}
                  onChange={(e) => setPage(Number(e.target.value))}
                >
                  {Array.from({ length: pages }, (_, i) => (
                    <option value={i} key={i}>
                      {i + 1}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Записей на странице:{" "}
                <select
                  aria-label="Записей на странице"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(0);
                  }}
                >
                  {[10, 25, 50].map((size) => (
                    <option key={size}>{size}</option>
                  ))}
                </select>
              </label>
              <strong>
                {filtered.length ? safePage * pageSize + 1 : 0}-
                {Math.min((safePage + 1) * pageSize, filtered.length)} из{" "}
                {filtered.length}
              </strong>
              <ArmIconButton
                icon="left"
                label="Предыдущая страница"
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
              />
              <ArmIconButton
                icon="right"
                label="Следующая страница"
                disabled={safePage >= pages - 1}
                onClick={() => setPage(safePage + 1)}
              />
            </div>
          </>
        )}
      </section>
    </>
  );
}
