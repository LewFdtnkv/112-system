import { catalogKeys, serviceProfileApi } from "@/entities/catalog";
import { ServerSelect } from "@/shared/ui/ServerSelect";
import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Stack,
  Typography,
} from "@mui/material";
import { useDDSProfile } from "../model/useDDSProfile";
import type { CardDDSSettingsProps } from "../types/CardDDSSettings";
import { ddsEditorStyles } from "../styles/CardDDSSettings";
import { DDSCrewExerciseFields } from "./DDSCrewExerciseFields";

export function CardDDSSettings({ value, onChange }: CardDDSSettingsProps) {
  const profile = useDDSProfile(value?.service_profile_id);
  return (
    <Stack spacing={2} sx={ddsEditorStyles.section}>
      <FormControlLabel
        label="Подготовить карточку для оператора ДДС"
        control={
          <Checkbox
            checked={!!value}
            onChange={(_, enabled) =>
              onChange(
                enabled
                  ? {
                      service_profile_id: "",
                      initial_crews: [],
                      required_crews: [],
                      messages: [],
                      crew_calls_required: false,
                    }
                  : null,
              )
            }
          />
        }
      />
      {value && (
        <>
          <Typography variant="h6" component="h2">
            Работа бригад по карточке
          </Typography>
          <Alert severity="info">
            История — уже выполненные до начала занятия действия. Новые
            сообщения показываются у бригад: ученик сам вносит следующие
            статусы. Исходная история не приносит баллы.
          </Alert>
          <ServerSelect
            name="dds_exercise.service_profile_id"
            required
            label="Профиль службы ДДС"
            queryKey={catalogKeys.profiles}
            value={
              value.service_profile_id
                ? {
                    id: value.service_profile_id,
                    label: profile.data?.name ?? "Профиль ДДС",
                  }
                : null
            }
            onChange={(next) =>
              onChange({
                ...value,
                service_profile_id: next?.id ?? "",
                initial_crews: [],
                required_crews: [],
                messages: [],
              })
            }
            load={async (query, signal) =>
              (await serviceProfileApi.list(query, signal)).map((p) => ({
                id: p.id,
                label: p.name,
              }))
            }
          />
          <FormControlLabel
            label="При новом назначении ученик звонит руководителю бригады"
            control={
              <Checkbox
                checked={value.crew_calls_required}
                onChange={(_, checked) =>
                  onChange({ ...value, crew_calls_required: checked })
                }
              />
            }
          />
          {profile.error && (
            <Alert severity="error">
              Не удалось загрузить бригады.{" "}
              <Button onClick={() => void profile.refetch()}>Повторить</Button>
            </Alert>
          )}
          {profile.data && !profile.data.crews?.some((c) => c.is_active) && (
            <Alert severity="warning">
              В профиле нет действующих бригад. Добавьте их в справочник служб.
            </Alert>
          )}
          {profile.data?.crews
            ?.filter((c) => c.is_active)
            .map((crew) => (
              <DDSCrewExerciseFields
                key={crew.code}
                crew={crew}
                value={value}
                onChange={onChange}
              />
            ))}
          {!value.required_crews.length && (
            <Alert severity="warning">
              Выберите хотя бы одну учебную цель и опишите сообщение для
              ученика.
            </Alert>
          )}
        </>
      )}
    </Stack>
  );
}
