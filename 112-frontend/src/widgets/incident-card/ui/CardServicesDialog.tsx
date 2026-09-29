import { getApiError } from "@/shared/api";
import { useDebounced } from "@/shared/lib/useDebounced";
import { ArmField, ArmIconButton } from "@/shared/ui/arm";
import { PageControls } from "@/shared/ui/QueryState";
import { Dialog, DialogContent, DialogTitle } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";
import type { Props } from "../types/CardServicesDialog";
import { useIncidentCardContext } from "../model/IncidentCardContext";

export function CardServicesDialog({ open, onClose }: Props) {
  const titleId = useId();
  const editor = useIncidentCardContext().editor;
  const {
    fields,
    remote,
    toggleService: onToggle,
    useRecommendedServices: onReset,
  } = editor;
  const selected = fields.services;
  const manual = fields.manualServices != null;
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const search = useDebounced(query.trim());
  const result = useQuery({
    queryKey: ["card-service-options", remote.serviceQueryKey, search, page],
    enabled: open && !!remote.loadServices,
    queryFn: ({ signal }) => remote.loadServices!(search, page * 20, signal),
  });
  const visible = search === query.trim() ? (result.data?.items ?? []) : [];
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      className="arm-services-dialog"
      aria-labelledby={titleId}
    >
      <DialogTitle id={titleId}>
        Добавьте службы
        <ArmIconButton
          icon="close"
          label="Закрыть выбор служб"
          onClick={onClose}
        />
      </DialogTitle>
      <DialogContent>
        <ArmField
          label="Поиск службы"
          inline
          placeholder="Поиск ..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(0);
          }}
        />
        <p className="arm-services-help">
          ЕКП рекомендует службы. Можно добавить или убрать службу перед
          сохранением карточки.
        </p>
        {manual && (
          <button className="arm-small-button" onClick={onReset}>
            Вернуть рекомендации ЕКП
          </button>
        )}
        <ul>
          {visible.map((service) => (
            <li key={service.id}>
              <button
                aria-label={[service.short_name, service.name]
                  .filter(Boolean)
                  .join(" — ")}
                aria-pressed={selected.includes(service.id)}
                onClick={() =>
                  onToggle(service.id, service.name, service.short_name)
                }
              >
                {service.short_name ? (
                  <>
                    <strong>{service.short_name}</strong>{" "}
                    <span>({service.name})</span>
                  </>
                ) : (
                  service.name
                )}
              </button>
            </li>
          ))}
          {!visible.length && !result.isFetching && !result.error && (
            <li className="arm-services-empty">Служба не найдена.</li>
          )}
        </ul>
        {result.isFetching && <p role="status">Загрузка…</p>}
        {result.error && (
          <p role="alert">{getApiError(result.error).message}</p>
        )}
        {result.data && (
          <PageControls
            total={result.data.total}
            page={page}
            onPage={setPage}
          />
        )}
        <button className="arm-services-confirm" onClick={onClose}>
          Сохранить и закрыть
        </button>
      </DialogContent>
    </Dialog>
  );
}
