import { ValidationField } from "@/shared/ui/form-validation";
import { catalogApi } from "@/entities/catalog";
import { FeatureInput } from "@/shared/ui/FeatureInput";
import { ServerSelect } from "@/shared/ui/ServerSelect";
import {
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
  Stack,
} from "@mui/material";
import { styles } from "../styles/RuleForm";
import type { RuleRoutesEditorProps } from "../types/RuleFormEditors";

export function RuleRoutesEditor({
  form,
  editable,
  onChange,
}: RuleRoutesEditorProps) {
  return (
    <ValidationField name="entry.routes" label="Правила оповещения">
      <Stack spacing={2}>
        {form.notification_required !== false && <b>Правила оповещения</b>}
        {form.routes.map((route, index) => (
          <Paper key={index} sx={styles.paper}>
            <Stack spacing={1}>
              <ServerSelect
                name={`entry.routes.${index}.service_code`}
                required
                label={`Служба маршрута ${index + 1}`}
                queryKey={["admin-service-code-options"]}
                disabled={!editable}
                value={
                  route.service_code
                    ? { id: route.service_code, label: route.service_code }
                    : null
                }
                onChange={(service) =>
                  onChange({
                    ...form,
                    routes: form.routes.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, service_code: service?.id ?? "" }
                        : item,
                    ),
                  })
                }
                load={async (query, signal) =>
                  (await catalogApi.services({ q: query }, signal)).items.map(
                    (service) => ({
                      id: service.code,
                      label: `${service.code} — ${service.name}`,
                    }),
                  )
                }
              />
              <FormControlLabel
                label="Главная служба"
                control={
                  <Checkbox
                    checked={route.is_main}
                    onChange={(_, is_main) =>
                      onChange({
                        ...form,
                        routes: form.routes.map((item, itemIndex) => ({
                          ...item,
                          is_main: itemIndex === index ? is_main : false,
                        })),
                      })
                    }
                  />
                }
              />
              <span>Все выбранные условия должны выполняться:</span>
              {form.features
                .filter((feature) => feature.key)
                .map((feature) => (
                  <FeatureInput
                    key={feature.key}
                    validationName={`entry.routes.${index}.when.${feature.key}`}
                    feature={feature}
                    condition
                    disabled={!editable}
                    value={route.when[feature.key]}
                    onChange={(value) => {
                      const when = { ...route.when };
                      if (
                        value === undefined ||
                        (Array.isArray(value) && !value.length)
                      )
                        delete when[feature.key];
                      else when[feature.key] = value;
                      onChange({
                        ...form,
                        routes: form.routes.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, when } : item,
                        ),
                      });
                    }}
                  />
                ))}
              <Button
                disabled={form.routes.length === 1}
                onClick={() =>
                  onChange({
                    ...form,
                    routes: form.routes.filter(
                      (_, itemIndex) => itemIndex !== index,
                    ),
                  })
                }
              >
                Удалить маршрут
              </Button>
            </Stack>
          </Paper>
        ))}
        <Button
          disabled={form.notification_required === false}
          onClick={() =>
            onChange({
              ...form,
              routes: [
                ...form.routes,
                { service_code: "", is_main: false, when: {} },
              ],
            })
          }
        >
          Добавить маршрут
        </Button>
      </Stack>
    </ValidationField>
  );
}
