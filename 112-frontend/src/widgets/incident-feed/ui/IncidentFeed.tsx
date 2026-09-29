import { incidentStatusLabels } from "@/entities/incident-card";
import { ArmIcon } from "@/shared/ui/arm";
import { useMemo, useState } from "react";
import "../styles/incident-feed.scss";
import { filterIncidents } from "../lib/filterIncidents";
import type { IncidentFeedFilters } from "../types/IncidentFeedFilters";
import type { IncidentFeedProps } from "../types/IncidentFeed";
import { IncidentFeedTable } from "./IncidentFeedTable";
import { IncidentPagination } from "./IncidentPagination";
import { IncidentSearchForm } from "./IncidentSearchForm";
import { JournalClock } from "./JournalClock";

const emptyFilters: IncidentFeedFilters = {
  query: "",
  address: "",
  district: "",
  status: "",
};

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
      filterIncidents(incidents, applied, status, notifications, descending),
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
          <IncidentSearchForm
            filters={filters}
            advanced={advanced}
            onFiltersChange={setFilters}
            onSubmit={() => {
              setApplied(filters);
              setPage(0);
            }}
            onReset={reset}
            onAdvancedToggle={() => setAdvanced(!advanced)}
          />
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
              onChange={(event) => {
                setNotifications(event.target.checked);
                setPage(0);
              }}
            />
            <ArmIcon name="comment" />
            уведомления
          </label>
          <select
            aria-label="Какие карточки показать"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
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
            <IncidentFeedTable
              incidents={shown}
              selectedId={selectedId}
              timing={timing}
              workflowStatus={workflowStatus}
              descending={descending}
              hiddenDescriptions={hiddenDescriptions}
              onOpen={onOpen}
              onSortToggle={() => setDescending(!descending)}
              onDescriptionToggle={(id) =>
                setHiddenDescriptions((current) =>
                  current.includes(id)
                    ? current.filter((item) => item !== id)
                    : [...current, id],
                )
              }
            />
            <IncidentPagination
              page={safePage}
              pages={pages}
              pageSize={pageSize}
              total={filtered.length}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(0);
              }}
            />
          </>
        )}
      </section>
    </>
  );
}
