import "./cards.scss";
import { TrainingCardPreview } from "@/widgets/incident-card";
import {
  CardGenerationDialog,
  GenerationRows,
} from "@/features/card-generation";
import type { ReferenceCardSource } from "@/features/incident-editing";
import { useState } from "react";
import {
  Alert,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableContainer,
  Tooltip,
  TableRow,
  TextField,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import {
  trainingApi,
  generationApi,
  CardDataFields,
  type FeatureDefinition,
} from "@/entities/training";
import { CardEditor } from "./CardEditor";
import { useDebounced } from "@/shared/lib/useDebounced";
import { PageHeader } from "@/shared/ui/PageHeader";
import { QueryState, PageControls } from "@/shared/ui/QueryState";
export const CardsPage = () => {
  const [q, setQ] = useState("");
  const search = useDebounced(q);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [generate, setGenerate] = useState(false);
  const [jobPage, setJobPage] = useState(0);
  const jobs = useQuery({
    queryKey: ["card-generations", jobPage],
    queryFn: ({ signal }) => generationApi.jobs(jobPage * 10, signal),
    refetchInterval: 5000,
  });
  const [preview, setPreview] = useState<ReferenceCardSource>();
  const [detailId, setDetailId] = useState<string>();
  const [editing, setEditing] = useState(false);
  const query = useQuery({
    queryKey: ["cards", search, page],
    queryFn: ({ signal }) =>
      trainingApi.cards({ q: search, offset: page * 20 }, signal),
    refetchInterval: 5000,
  });
  const detail = useQuery({
    queryKey: ["card", detailId],
    queryFn: ({ signal }) => trainingApi.card(detailId!, signal),
    enabled: !!detailId,
  });
  return (
    <Stack spacing={2}>
      <PageHeader title="Библиотека карточек" />
      {preview && (
        <TrainingCardPreview
          reference={preview}
          onClose={() => setPreview(undefined)}
        />
      )}
      <Stack direction="row" spacing={2}>
        <Button onClick={() => setOpen(true)}>Создать карточку</Button>
        <Button variant="contained" onClick={() => setGenerate(true)}>
          Сгенерировать нейросетью
        </Button>
      </Stack>
      {generate && <CardGenerationDialog onClose={() => setGenerate(false)} />}
      {jobs.error && (
        <Alert severity="error">
          Не удалось загрузить состояния генерации.{" "}
          <Button onClick={() => void jobs.refetch()}>Повторить</Button>
        </Alert>
      )}
      {!!jobs.data?.total && (
        <div>
          <p role="status">
            В подготовке или требуют внимания: {jobs.data.total}. После
            генерации карточки появятся в библиотеке автоматически.
          </p>
          {jobs.data.total > 10 && (
            <PageControls
              page={jobs.data.offset / 10}
              size={10}
              total={jobs.data.total}
              onPage={setJobPage}
            />
          )}
        </div>
      )}
      <TextField
        label="Поиск карточки"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setPage(0);
        }}
      />
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      >
        {query.data && (
          <>
            <TableContainer>
              <Table
                className="card-library-table"
                aria-label="Библиотека карточек"
              >
                <colgroup>
                  <col style={{ width: "23%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "21%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "8%" }} />
                </colgroup>
                <TableHead>
                  <TableRow>
                    <TableCell>Название</TableCell>
                    <TableCell>Тип происшествия</TableCell>
                    <TableCell>Адрес</TableCell>
                    <TableCell>Службы</TableCell>
                    <TableCell align="center">В сценариях</TableCell>
                    <TableCell>Изменена</TableCell>
                    <TableCell align="center">Действия</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <GenerationRows jobs={jobs.data?.items ?? []} />
                  {query.data.items.map((c) => (
                    <TableRow
                      key={c.id}
                      hover
                      className="table-clickable-row"
                      onClick={(event) => {
                        if (
                          event.target instanceof Element &&
                          event.target.closest(
                            "a, button, .card-library-actions",
                          ) !== null
                        ) {
                          return;
                        }
                        setEditing(false);
                        setDetailId(c.id);
                      }}
                    >
                      <TableCell>
                        <Button
                          className="card-library-title"
                          onClick={() => {
                            setEditing(false);
                            setDetailId(c.id);
                          }}
                        >
                          {c.title}
                        </Button>
                        {c.generated_by_ai && <small>Создана нейросетью</small>}
                        <small>
                          {c.scenario_count
                            ? "Используется · только просмотр"
                            : "Доступна для редактирования"}
                        </small>
                      </TableCell>
                      <TableCell>
                        <span>{c.incident_name}</span>
                        <small
                          title={c.classifier_label}
                          className="card-library-clamp"
                        >
                          {c.classifier_label}
                        </small>
                      </TableCell>
                      <TableCell>
                        <span
                          className="card-library-clamp"
                          title={c.address_text}
                        >
                          {c.address_text || "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="card-library-services">
                          {c.recipients.length ? (
                            c.recipients
                              .slice(0, 2)
                              .map((s) => (
                                <Chip
                                  key={s.service_id}
                                  size="small"
                                  label={s.short_name || s.name}
                                  title={s.name}
                                />
                              ))
                          ) : (
                            <span>Без оповещения</span>
                          )}
                          {c.recipients.length > 2 && (
                            <small
                              title={c.recipients
                                .slice(2)
                                .map((s) => s.name)
                                .join("; ")}
                            >
                              Ещё {c.recipients.length - 2}
                            </small>
                          )}
                        </div>
                      </TableCell>
                      <TableCell align="center">{c.scenario_count}</TableCell>
                      <TableCell>
                        <time dateTime={c.updated_at}>
                          {new Date(c.updated_at).toLocaleDateString("ru-RU", {
                            timeZone: "Europe/Moscow",
                          })}
                          <small>
                            {new Date(c.updated_at).toLocaleTimeString(
                              "ru-RU",
                              {
                                timeZone: "Europe/Moscow",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </small>
                        </time>
                      </TableCell>
                      <TableCell
                        align="center"
                        className="card-library-actions"
                      >
                        <Tooltip
                          title={
                            c.scenario_count
                              ? "Карточка уже включена в сценарий. Редактирование недоступно."
                              : "Изменить карточку"
                          }
                        >
                          <span>
                            <Button
                              size="small"
                              disabled={c.scenario_count > 0}
                              aria-label={`Редактировать карточку «${c.title}»`}
                              onClick={() => {
                                setEditing(true);
                                setDetailId(c.id);
                              }}
                            >
                              Изменить
                            </Button>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!query.data.items.length && !jobs.data?.items.length && (
                    <TableRow>
                      <TableCell colSpan={7}>Карточки не найдены.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            {query.data.total > 0 && (
              <PageControls
                total={query.data.total}
                page={page}
                onPage={setPage}
              />
            )}
          </>
        )}
      </QueryState>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>Новая учебная карточка</DialogTitle>
        <DialogContent>
          <CardEditor onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!detailId}
        onClose={() => setDetailId(undefined)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          {editing
            ? "Редактирование карточки"
            : (detail.data?.title ?? "Карточка")}
        </DialogTitle>
        <DialogContent>
          <QueryState
            pending={detail.isPending}
            error={detail.error}
            retry={() => void detail.refetch()}
          >
            {detail.data?.generated_by_ai && (
              <Alert severity="info">
                Материал сгенерирован ИИ. Проверьте условие и эталонное решение
                перед включением в сценарий.
              </Alert>
            )}
            {detail.data && editing && detail.data.can_edit && (
              <CardEditor
                key={`${detail.data.id}:${detail.data.revision}`}
                initial={detail.data}
                onClose={() => setDetailId(undefined)}
                onReload={() => void detail.refetch()}
              />
            )}
            {detail.data && editing && !detail.data.can_edit && (
              <Alert severity="info">
                Карточка уже включена в сценарий. Доступен только просмотр.
              </Alert>
            )}
            {detail.data && (!editing || !detail.data.can_edit) && (
              <div className="template-detail">
                <aside className="template-condition">
                  <h3>Условие для ученика</h3>
                  <p className="template-message">
                    {detail.data.caller_message}
                  </p>
                  <h4>Инструкция</h4>
                  <p>
                    {detail.data.instructions || "Дополнительных указаний нет"}
                  </p>
                  <small>Эти сведения доступны ученику во время задания.</small>
                </aside>
                <section
                  className="template-solution"
                  aria-label="Эталонное решение"
                >
                  <div className="template-solution-heading">
                    <h3>Эталонное решение</h3>
                    <Button onClick={() => setPreview(detail.data!)}>
                      Открыть в АРМ
                    </Button>
                  </div>
                  <p className="template-explanation">
                    Образец для сравнения. Другая формулировка может быть
                    корректной; смысловые поля проверяются отдельно.
                  </p>
                  <div className="template-routing">
                    <b>Тип происшествия</b>
                    <p>
                      {detail.data.classifier_entry?.display_name ||
                        detail.data.classifier_entry?.name ||
                        "Тип не загружен"}
                    </p>
                    <b>Службы</b>
                    <ul>
                      {detail.data.recipients?.length ? (
                        detail.data.recipients.map((service) => (
                          <li key={service.service_id}>
                            {service.short_name && (
                              <strong>{service.short_name} · </strong>
                            )}
                            {service.name}
                          </li>
                        ))
                      ) : (
                        <li>Без оповещения служб</li>
                      )}
                    </ul>
                  </div>
                  <CardDataFields
                    data={detail.data.data}
                    features={
                      detail.data.classifier_entry?.conditions.features as
                        FeatureDefinition[] | undefined
                    }
                  />
                </section>
              </div>
            )}
          </QueryState>
          {(!editing || !detail.data?.can_edit) && (
            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              {detail.data?.can_edit && (
                <Button onClick={() => setEditing(true)}>
                  Редактировать карточку
                </Button>
              )}
              <Button onClick={() => setDetailId(undefined)}>Закрыть</Button>
            </Stack>
          )}
        </DialogContent>
      </Dialog>
    </Stack>
  );
};
