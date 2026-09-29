import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
} from "@mui/material";
import { crewStatusLabels } from "@/entities/training";
import { catalogKeys, serviceProfileApi } from "@/entities/catalog";
import { getApiError } from "@/shared/api";
import { ServerSelect } from "@/shared/ui/ServerSelect";
import { ValidatedForm, ValidatedTextField } from "@/shared/ui/form-validation";
import { useDDSGeneration } from "../model/useDDSGeneration";
import type { DDSGenerationProps } from "../types/DDSGeneration";
import "../styles/dds-generation.scss";

export function DDSGeneration({ card }: DDSGenerationProps) {
  const m = useDDSGeneration(card);
  const p = m.parameters;
  const wrongService =
    m.directory.data &&
    !card.recipient_service_ids.includes(m.directory.data.service_id);
  return (
    <div className="dds-generation">
      {m.latest && (
        <Alert
          severity={
            m.latest.status === "failed"
              ? "warning"
              : m.latest.status === "succeeded"
                ? "success"
                : "info"
          }
        >
          {m.latest.status === "failed"
            ? m.latest.error
            : m.latest.status === "succeeded"
              ? "Упражнение ДДС подготовлено. Проверьте историю, сообщения и цели перед назначением занятия."
              : "Генерация ДДС в очереди или выполняется. Карточкой можно пользоваться; окно можно закрыть."}
        </Alert>
      )}
      {m.jobs.error && (
        <Alert severity="error">
          Не удалось загрузить задачи ДДС.{" "}
          <Button onClick={() => void m.jobs.refetch()}>Повторить</Button>
        </Alert>
      )}
      {card.can_edit && (
        <Button
          variant="outlined"
          disabled={m.pending || m.jobs.isPending || !!m.jobs.error}
          onClick={() => m.setOpen(true)}
        >
          Сгенерировать упражнение ДДС
        </Button>
      )}
      {m.open && (
        <Dialog
          open
          fullWidth
          maxWidth="sm"
          onClose={m.save.isPending ? undefined : () => m.setOpen(false)}
          aria-labelledby="dds-generation-title"
        >
          <DialogTitle id="dds-generation-title">
            Сгенерировать упражнение ДДС
          </DialogTitle>
          <DialogContent>
            <ValidatedForm
              id="dds-generation-form"
              error={m.save.error}
              onSubmit={() => m.save.mutate()}
            >
              {["not_accepted", "refused", "cancelled"].includes(
                p.target_status ?? "",
              ) && (
                <ValidatedTextField
                  disabled={m.save.isPending}
                  name="reason"
                  label="Причина отказа или отмены"
                  required
                  helperText="Эта причина будет сообщена ученику в условии."
                  value={p.reason ?? ""}
                  onChange={(e) => m.change({ reason: e.target.value })}
                  slotProps={{ htmlInput: { maxLength: 2000 } }}
                />
              )}
              <fieldset
                className="dds-generation__form"
                disabled={m.save.isPending}
              >
                <Alert severity="info">
                  ИИ получит готовую карточку и выбранные статусы. Он напишет
                  историю и новые сообщения бригад. Если проверка отклонит
                  текст, карточка останется без изменений.
                </Alert>
                <ServerSelect
                  required
                  name="service_profile_id"
                  label="Профиль службы ДДС"
                  queryKey={catalogKeys.profiles}
                  value={m.profile}
                  onChange={(value) => {
                    m.setProfile(value);
                    m.change({
                      service_profile_id: value?.id ?? "",
                      crew_codes: null,
                    });
                  }}
                  load={async (q, signal) =>
                    (await serviceProfileApi.list(q, signal)).map((v) => ({
                      id: v.id,
                      label: v.name,
                    }))
                  }
                />
                {wrongService && (
                  <Alert severity="error">
                    Служба этого профиля не входит в получателей карточки.
                    Выберите другой профиль.
                  </Alert>
                )}
                {m.directory.error && (
                  <Alert severity="error">
                    {getApiError(m.directory.error).message}
                    <Button onClick={() => void m.directory.refetch()}>
                      Повторить
                    </Button>
                  </Alert>
                )}
                <div className="dds-generation__crews">
                  <FormControlLabel
                    label="Выбрать одну случайную бригаду"
                    control={
                      <Checkbox
                        checked={p.crew_codes === null}
                        onChange={(_, checked) =>
                          m.change({ crew_codes: checked ? null : [] })
                        }
                      />
                    }
                  />
                  {p.crew_codes !== null &&
                    m.directory.data?.crews
                      ?.filter((c) => c.is_active)
                      .map((c) => (
                        <FormControlLabel
                          key={c.code}
                          label={c.name}
                          control={
                            <Checkbox
                              checked={p.crew_codes!.includes(c.code)}
                              disabled={
                                !p.crew_codes!.includes(c.code) &&
                                p.crew_codes!.length >= 2
                              }
                              onChange={(_, checked) =>
                                m.change({
                                  crew_codes: checked
                                    ? [...p.crew_codes!, c.code]
                                    : p.crew_codes!.filter(
                                        (code) => code !== c.code,
                                      ),
                                })
                              }
                            />
                          }
                        />
                      ))}
                  <small>
                    Можно указать одну или две бригады. Остальные бригады ИИ не
                    добавляет.
                  </small>
                </div>
                <div className="dds-generation__statuses">
                  <ValidatedTextField
                    select
                    label="Состояние к началу"
                    name="initial_status"
                    value={p.initial_status ?? ""}
                    onChange={(e) =>
                      m.change({ initial_status: e.target.value || null })
                    }
                  >
                    <MenuItem value="">Случайно</MenuItem>
                    <MenuItem value="unassigned">Ещё не назначена</MenuItem>
                    {["assigned", "responding", "arrived", "in_progress"].map(
                      (s) => (
                        <MenuItem key={s} value={s}>
                          {crewStatusLabels[s]}
                        </MenuItem>
                      ),
                    )}
                  </ValidatedTextField>
                  <ValidatedTextField
                    select
                    label="Учебная цель"
                    name="target_status"
                    value={p.target_status ?? ""}
                    onChange={(e) =>
                      m.change({ target_status: e.target.value || null })
                    }
                  >
                    <MenuItem value="">Случайно</MenuItem>
                    {Object.entries(crewStatusLabels).map(([s, label]) => (
                      <MenuItem key={s} value={s}>
                        {label}
                      </MenuItem>
                    ))}
                  </ValidatedTextField>
                </div>
                <small>
                  Для каждой бригады случайные значения выбираются отдельно.
                  Цель должна оставлять ученику работу после исходной истории.
                </small>
                <FormControlLabel
                  label="Требовать звонок при назначении новой бригады"
                  control={
                    <Checkbox
                      checked={p.crew_calls_required}
                      onChange={(_, checked) =>
                        m.change({ crew_calls_required: checked })
                      }
                    />
                  }
                />
                <small>
                  Ученик сам звонит руководителю и получает подтверждение. Уже
                  назначенные предыдущей сменой бригады повторного звонка не
                  требуют.
                </small>
                {card.dds_exercise && (
                  <FormControlLabel
                    label="Заменить существующее упражнение ДДС после успешной проверки"
                    control={
                      <Checkbox
                        required
                        checked={p.replace_existing}
                        onChange={(_, checked) =>
                          m.change({ replace_existing: checked })
                        }
                      />
                    }
                  />
                )}
              </fieldset>
            </ValidatedForm>
          </DialogContent>
          <DialogActions>
            <Button
              onClick={() => m.setOpen(false)}
              disabled={m.save.isPending}
            >
              Отмена
            </Button>
            <Button
              type="submit"
              form="dds-generation-form"
              variant="contained"
              disabled={
                m.save.isPending ||
                !m.directory.data ||
                !!wrongService ||
                p.crew_codes?.length === 0 ||
                (!!card.dds_exercise && !p.replace_existing)
              }
            >
              Запустить генерацию ДДС
            </Button>
          </DialogActions>
        </Dialog>
      )}
    </div>
  );
}
