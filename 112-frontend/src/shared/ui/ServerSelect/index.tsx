import { getApiError } from "@/shared/api";
import { useDebounced } from "@/shared/lib/useDebounced";
import { Autocomplete, TextField } from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { ServerSelectProps } from "./types/index";
export function ServerSelect({
  label,
  queryKey,
  load,
  value,
  onChange,
  disabled = false,
}: ServerSelectProps) {
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

export type { SelectOption } from "./types/index";
