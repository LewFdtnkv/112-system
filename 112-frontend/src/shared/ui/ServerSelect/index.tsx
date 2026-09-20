import { Autocomplete, TextField } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useDebounced } from "@/shared/lib/useDebounced";
import { getApiError } from "@/shared/api";
export interface SelectOption {
  id: string;
  label: string;
  metadata?: unknown;
}
export function ServerSelect({
  label,
  queryKey,
  load,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  queryKey: readonly unknown[];
  load: (search: string, signal: AbortSignal) => Promise<SelectOption[]>;
  value: SelectOption | null;
  onChange: (value: SelectOption | null) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState("");
  const debounced = useDebounced(search);
  const query = useQuery({
    queryKey: [...queryKey, debounced],
    queryFn: ({ signal }) => load(debounced, signal),
    enabled: !disabled,
  });
  return (
    <Autocomplete
      disabled={disabled}
      options={query.data ?? []}
      value={value}
      getOptionLabel={(option) =>
        query.data?.find((item) => item.id === option.id)?.label ?? option.label
      }
      isOptionEqualToValue={(a, b) => a.id === b.id}
      filterOptions={(options) => options}
      loading={query.isFetching}
      noOptionsText={
        query.error ? "Ошибка загрузки" : "Совпадений нет. Уточните поиск."
      }
      onInputChange={(_, text, reason) => {
        if (reason === "input" || reason === "clear") setSearch(text);
      }}
      onChange={(_, next) => onChange(next)}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          error={!!query.error}
          helperText={
            query.error
              ? getApiError(query.error).message
              : "Поиск на сервере; показаны первые 20 совпадений"
          }
        />
      )}
    />
  );
}
