import { ValidationField } from "@/shared/ui/form-validation";
import { QueryState } from "@/shared/ui/QueryState";
import { ServerSelect } from "@/shared/ui/ServerSelect";
import { cardApi } from "@/entities/training";
import { Alert, Checkbox, Chip, FormControlLabel, Stack } from "@mui/material";
import { styles } from "../styles/CardEditor";
import type { CardEditorPanelProps } from "../types/CardEditorPanels";

export function CardEditorRecipients({
  editor,
  initial,
}: Pick<CardEditorPanelProps, "editor" | "initial">) {
  const {
    entry,
    features,
    manualRecipients,
    optional,
    recipients,
    routes,
    setManualRecipients,
    setOptional,
    silent,
  } = editor;
  return (
    <ValidationField
      name="recipient_service_ids"
      label="Службы для оповещения"
      validate={() =>
        !silent &&
        entry &&
        editor.notificationRequired &&
        manualRecipients === null &&
        !recipients.length
          ? "Не удалось подобрать службы. Уточните признаки или задайте службы вручную."
          : undefined
      }
    >
      {!silent && entry && (
        <FormControlLabel
          label="Задать службы эталонного решения вручную"
          control={
            <Checkbox
              checked={manualRecipients !== null}
              onChange={(_, checked) =>
                setManualRecipients(
                  checked
                    ? (routes.data ?? [])
                        .filter((route) =>
                          recipients.includes(route.service_id),
                        )
                        .map((route) => ({
                          id: route.service_id,
                          label: route.service_name,
                        }))
                    : null,
                )
              }
            />
          }
        />
      )}
      {!silent && manualRecipients !== null && (
        <Stack spacing={1}>
          {initial && (
            <Alert severity="info">
              Показан сохранённый список служб. Чтобы пересчитать его по ЕКП,
              снимите флажок ручного выбора.
            </Alert>
          )}
          <Alert severity="info">
            Используйте для исключений из ЕКП. Укажите причину и сведения для
            решения в условии для 112. Оператор 112 оценивается по этому списку;
            пустой список означает регистрацию без оповещения. В режиме ДДС это
            службы, которым уже поступила карточка.
          </Alert>
          <ServerSelect
            label="Добавить службу в эталонное решение"
            queryKey={["reference-services"]}
            value={null}
            onChange={(value) => {
              if (
                value &&
                !manualRecipients.some((service) => service.id === value.id)
              )
                setManualRecipients([...manualRecipients, value]);
            }}
            load={async (query, signal) =>
              (await cardApi.services(query, signal)).map((service) => ({
                id: service.id,
                label: service.name,
              }))
            }
          />
          <Stack direction="row" sx={styles.stack}>
            {manualRecipients.map((service) => (
              <Chip
                key={service.id}
                label={service.label}
                onDelete={() =>
                  setManualRecipients(
                    manualRecipients.filter((item) => item.id !== service.id),
                  )
                }
              />
            ))}
          </Stack>
        </Stack>
      )}
      {!silent && entry && manualRecipients === null && (
        <QueryState
          pending={routes.isPending}
          error={routes.error}
          retry={() => void routes.refetch()}
        >
          {routes.data?.map((route) => (
            <FormControlLabel
              key={route.service_id}
              label={
                route.service_name +
                (Object.keys(route.conditions).length
                  ? " (условный маршрут)"
                  : "")
              }
              control={
                <Checkbox
                  checked={recipients.includes(route.service_id)}
                  disabled={
                    features.length > 0 || !Object.keys(route.conditions).length
                  }
                  onChange={(_, checked) =>
                    setOptional(
                      checked
                        ? [...optional, route.service_id]
                        : optional.filter((id) => id !== route.service_id),
                    )
                  }
                />
              }
            />
          ))}
        </QueryState>
      )}
      {!features.length &&
        routes.data?.some(
          (route) => Object.keys(route.conditions).length > 0,
        ) && (
          <Alert severity="warning">
            Выполнение учеником условных маршрутов пока недоступно.
          </Alert>
        )}
    </ValidationField>
  );
}
