import { Alert, Button } from "@mui/material";
import { getApiError } from "@/shared/api";
import type { AttemptDraftNoticeProps } from "../types/AttemptDraft";

export function AttemptDraftNotice({ draft, error }: AttemptDraftNoticeProps) {
  return (
    <>
      {draft.storageFailed && (
        <Alert severity="warning">
          Не удалось сохранить копию в браузере. Не закрывайте страницу, пока
          данные не сохранены на сервере.
        </Alert>
      )}
      {draft.conflict ? (
        <Alert severity="warning">
          На сервере другая версия карточки.{" "}
          {draft.storageFailed
            ? "Ваш текст остаётся в открытой форме."
            : "Ваш черновик сохранён в браузере."}{" "}
          Выберите, какие данные оставить; серверные изменения не будут заменены
          автоматически.
          <div>
            <Button
              disabled={draft.resolve.isPending}
              onClick={() => draft.resolve.mutate(true)}
            >
              Сохранить мой черновик
            </Button>
            <Button
              disabled={draft.resolve.isPending}
              onClick={() => draft.resolve.mutate(false)}
            >
              Загрузить серверную версию
            </Button>
          </div>
        </Alert>
      ) : error ? (
        <Alert severity="warning">
          На сервере пока не сохранено.{" "}
          {draft.storageFailed ? "" : "Копия остаётся в этом браузере. "}
          {error}{" "}
          {draft.retryable
            ? "После восстановления связи отправка повторится."
            : "Исправьте данные и сохраните карточку снова."}
        </Alert>
      ) : draft.restored && draft.localPending ? (
        <Alert severity="info">
          Восстановлен черновик из этого браузера. Отправляем изменения на
          сервер.
        </Alert>
      ) : null}
      {draft.resolve.error && (
        <Alert severity="error">
          {getApiError(draft.resolve.error).message}
        </Alert>
      )}
    </>
  );
}
