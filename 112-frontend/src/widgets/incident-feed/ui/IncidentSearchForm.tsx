import { ArmField, ArmIcon, ArmIconButton } from "@/shared/ui/arm";
import type { IncidentSearchFormProps } from "../types/IncidentSearchForm";
export function IncidentSearchForm({
  filters,
  advanced,
  onFiltersChange,
  onSubmit,
  onReset,
  onAdvancedToggle,
}: IncidentSearchFormProps) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="arm-journal-search__line">
        <input
          aria-label="Поиск происшествий"
          placeholder="Поиск происшествий"
          value={filters.query}
          onChange={(event) =>
            onFiltersChange({ ...filters, query: event.target.value })
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
          onClick={onAdvancedToggle}
        >
          расширенный по параметрам <ArmIcon name={advanced ? "up" : "down"} />
        </button>
        <button className="arm-small-button" type="button" onClick={onReset}>
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
              onChange={(event) =>
                onFiltersChange({ ...filters, [key]: event.target.value })
              }
            />
          ))}
        </div>
      )}
    </form>
  );
}
