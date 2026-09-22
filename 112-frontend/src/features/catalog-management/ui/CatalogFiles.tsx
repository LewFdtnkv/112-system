import { getApiError } from "@/shared/api";
import { Alert, Button, Stack } from "@mui/material";
import { useCatalogImport } from "../model/useCatalogImport";
import type { CatalogFilesProps } from "../types/CatalogRules";
export function CatalogFiles({ onImported }: CatalogFilesProps) {
  const upload = useCatalogImport(onImported);
  return (
    <Stack spacing={1}>
      <Alert severity="info">
        Импорт создаёт черновик ЕКП. Проверьте признаки и маршруты перед
        публикацией. Опубликованные версии сохраняются для уже назначенных
        уроков.
      </Alert>
      <Button component="label" disabled={upload.isPending}>
        Загрузить JSON-файл
        <input
          hidden
          aria-label="Загрузить ЕКП JSON"
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
            e.target.value = "";
          }}
        />
      </Button>
      <Button
        component="a"
        href={`${import.meta.env.BASE_URL}examples/classifier.json`}
        download="ekp-example.json"
      >
        Скачать пример JSON
      </Button>
      {upload.error && (
        <Alert severity="error">
          {upload.error.message === "Файл больше 8 МБ"
            ? upload.error.message
            : getApiError(upload.error).message}
        </Alert>
      )}
      {upload.isSuccess && (
        <Alert severity="success">Черновик ЕКП загружен</Alert>
      )}
    </Stack>
  );
}
