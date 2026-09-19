import SearchIcon from "@mui/icons-material/Search";
import {
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import { useMemo, useState } from "react";

import {
  formatAddress,
  getCategoryName,
  incidentStatusLabels,
  type IncidentCard,
} from "@/entities/incident-card";

interface IncidentFeedProps {
  incidents: readonly IncidentCard[];
  selectedId?: string;
  onOpen: (incident: IncidentCard) => void;
}

interface FeedFilters {
  type: string;
  address: string;
  district: string;
  status: string;
}

const emptyFilters: FeedFilters = {
  type: "",
  address: "",
  district: "",
  status: "",
};

const statusClassName: Record<string, string> = {
  in_progress: "incident-status incident-status--warning",
  not_notified: "incident-status incident-status--alert",
  closed: "incident-status incident-status--done",
};

const normalize = (value: string) => value.toLocaleLowerCase("ru-RU").trim();

export const IncidentFeed = ({
  incidents,
  selectedId,
  onOpen,
}: IncidentFeedProps) => {
  const [filters, setFilters] = useState<FeedFilters>(emptyFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<FeedFilters>(emptyFilters);

  const setFilter = (key: keyof FeedFilters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));

  const visibleIncidents = useMemo(() => {
    const applied = {
      type: normalize(appliedFilters.type),
      address: normalize(appliedFilters.address),
      district: normalize(appliedFilters.district),
      status: normalize(appliedFilters.status),
    };

    return incidents.filter(({ fields }) => {
      const categoryName = normalize(getCategoryName(fields.categoryId));
      const statusLabel = normalize(incidentStatusLabels[fields.status]);
      const addressLine = formatAddress(fields.address);

      const matchesType = !applied.type || categoryName.includes(applied.type);
      const matchesAddress =
        !applied.address ||
        normalize(`${addressLine} ${fields.description}`).includes(
          applied.address,
        );
      const matchesDistrict =
        !applied.district ||
        normalize(`${fields.address.district} ${addressLine}`).includes(
          applied.district,
        );
      const matchesStatus =
        !applied.status || statusLabel.includes(applied.status);

      return matchesType && matchesAddress && matchesDistrict && matchesStatus;
    });
  }, [incidents, appliedFilters]);

  return (
    <>
      <section
        className="incident-search"
        aria-labelledby="incident-search-title"
      >
        <div className="incident-search__title-row">
          <h1 id="incident-search-title">Поиск происшествий</h1>
          <SearchIcon aria-hidden="true" />
        </div>
        <form
          className="incident-search__form"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedFilters(filters);
          }}
        >
          <TextField
            label="Тип происшествия"
            value={filters.type}
            onChange={(event) => setFilter("type", event.target.value)}
          />
          <TextField
            label="По адресу"
            value={filters.address}
            onChange={(event) => setFilter("address", event.target.value)}
          />
          <TextField
            label="По округу"
            value={filters.district}
            onChange={(event) => setFilter("district", event.target.value)}
          />
          <TextField
            label="Статус"
            value={filters.status}
            onChange={(event) => setFilter("status", event.target.value)}
          />
          <div className="incident-search__actions">
            <Button type="submit" variant="outlined">
              Искать по параметрам
            </Button>
            <Button
              type="button"
              onClick={() => {
                setFilters(emptyFilters);
                setAppliedFilters(emptyFilters);
              }}
            >
              Сбросить
            </Button>
          </div>
        </form>
      </section>

      <section className="incident-list" aria-labelledby="incident-list-title">
        <div className="incident-list__heading">
          <h2 id="incident-list-title">Список происшествий</h2>
          <span>{visibleIncidents.length} карточек</span>
        </div>
        <TableContainer>
          <Table size="small" aria-label="Список происшествий">
            <TableHead>
              <TableRow>
                <TableCell>№ карточки</TableCell>
                <TableCell>Время</TableCell>
                <TableCell>Канал</TableCell>
                <TableCell>Тип происшествия</TableCell>
                <TableCell>Статус</TableCell>
                <TableCell>Адрес</TableCell>
                <TableCell aria-label="Открыть карточку" />
              </TableRow>
            </TableHead>
            <TableBody>
              {visibleIncidents.map((incident) => (
                <TableRow
                  className={
                    selectedId === incident.id
                      ? "incident-row--selected"
                      : undefined
                  }
                  key={incident.id}
                  onClick={() => onOpen(incident)}
                  tabIndex={0}
                >
                  <TableCell>{incident.id}</TableCell>
                  <TableCell>{incident.createdAt}</TableCell>
                  <TableCell>{incident.channel}</TableCell>
                  <TableCell>
                    <strong>
                      {getCategoryName(incident.fields.categoryId)}
                    </strong>
                    <small>{incident.fields.description}</small>
                  </TableCell>
                  <TableCell
                    className={statusClassName[incident.fields.status]}
                  >
                    {incidentStatusLabels[incident.fields.status]}
                  </TableCell>
                  <TableCell>
                    {formatAddress(incident.fields.address)}
                  </TableCell>
                  <TableCell>
                    <IconButton
                      aria-label={`Открыть карточку ${incident.id}`}
                      size="small"
                      onClick={() => onOpen(incident)}
                    >
                      <SearchIcon fontSize="inherit" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {visibleIncidents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center">
                    Карточки по заданным параметрам не найдены.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </section>
    </>
  );
};
