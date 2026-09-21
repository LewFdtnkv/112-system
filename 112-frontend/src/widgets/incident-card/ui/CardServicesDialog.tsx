import {
  responseServices,
  type ResponseService,
} from "@/entities/incident-card";
import { getApiError } from "@/shared/api";
import { useDebounced } from "@/shared/lib/useDebounced";
import { ArmField, ArmIconButton } from "@/shared/ui/arm";
import { PageControls } from "@/shared/ui/QueryState";
import { Dialog, DialogContent, DialogTitle } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { Props } from "../types/CardServicesDialog";

const serviceNames: Record<ResponseService, string> = {
  "101": "Служба 101 (Пожарно-спасательная служба)",
  "102": "Служба 102 (Полиция)",
  "103": "Служба 103 (Скорая и неотложная медицинская помощь)",
  "104": "Служба 104 (Аварийная газовая служба)",
};
export function CardServicesDialog({
  open,
  selected,
  onToggle,
  onClose,
  remote,
  manual,
  onReset,
}: Props) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const search = useDebounced(query.trim());
  const result = useQuery({
    queryKey: ["card-service-options", remote?.serviceQueryKey, search, page],
    enabled: open && !!remote?.loadServices,
    queryFn: ({ signal }) => remote!.loadServices!(search, page * 20, signal),
  });
  const visible = remote
    ? search === query.trim()
      ? (result.data?.items ?? [])
      : []
    : responseServices
        .filter((service) =>
          serviceNames[service]
            .toLocaleLowerCase("ru")
            .includes(query.toLocaleLowerCase("ru")),
        )
        .map((id) => ({ id, name: serviceNames[id], short_name: null }));
  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullWidth
      maxWidth="xs"
      className="arm-services-dialog"
      aria-labelledby="services-dialog-title"
    >
      <DialogTitle id="services-dialog-title">
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
        {remote && (
          <p className="arm-services-help">
            ЕКП рекомендует службы. Можно добавить или убрать службу перед
            сохранением карточки.
          </p>
        )}
        {remote && manual && (
          <button className="arm-small-button" onClick={onReset}>
            Вернуть рекомендации ЕКП
          </button>
        )}
        <ul>
          {visible.map((service) => (
            <li key={service.id}>
              <button
                aria-label={
                  remote
                    ? [service.short_name, service.name]
                        .filter(Boolean)
                        .join(" — ")
                    : service.id
                }
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
        {result.isFetching && remote && <p role="status">Загрузка…</p>}
        {result.error && remote && (
          <p role="alert">{getApiError(result.error).message}</p>
        )}
        {remote && result.data && (
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
