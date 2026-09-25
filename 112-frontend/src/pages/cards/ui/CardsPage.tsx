import {
  CardDataFields,
  cardGenerationQueryOptions,
  cardListQueryOptions,
  cardQueryOptions,
  type FeatureDefinition,
} from "@/entities/training";
import { CardEditor } from "@/features/card-authoring";
import {
  CardGenerationDialog,
  GenerationExample,
} from "@/features/card-generation";
import type { ReferenceCardSource } from "@/features/incident-editing";
import { useDebounced } from "@/shared/lib/useDebounced";
import { PageHeader } from "@/shared/ui/PageHeader";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
import { TrainingCardPreview } from "@/widgets/incident-card";
import {
  Alert,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import "../styles/cards.scss";
import { styles } from "../styles/CardsPage";
import { CardLibraryTable } from "./CardLibraryTable";
export const CardsPage = () => {
  const [q, setQ] = useState("");
  const search = useDebounced(q);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [generate, setGenerate] = useState(false);
  const [jobPage, setJobPage] = useState(0);
  const jobs = useQuery(cardGenerationQueryOptions(jobPage));
  const [preview, setPreview] = useState<ReferenceCardSource>();
  const [detailId, setDetailId] = useState<string>();
  const [editing, setEditing] = useState(false);
  const query = useQuery(cardListQueryOptions(search, page));
  const detail = useQuery(cardQueryOptions(detailId));
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
          Сгенерировать карточки
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
            <CardLibraryTable
              cards={query.data.items}
              generationJobs={jobs.data?.items ?? []}
              onOpen={(id) => {
                setEditing(false);
                setDetailId(id);
              }}
              onEdit={(id) => {
                setEditing(true);
                setDetailId(id);
              }}
            />
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
                {detail.data.generation_note ||
                  (detail.data.generation_method === "assisted"
                    ? "Сообщение подготовлено ИИ по заданным фактам."
                    : detail.data.generation_method === "template-fallback"
                      ? "Использован текст заготовки: ИИ недоступен или ответ не прошёл проверку."
                      : "Карточка подготовлена автоматически.")}
                {detail.data.generation_template &&
                  ` Сюжет: ${detail.data.generation_template}.`}{" "}
                Проверьте условие и эталонное решение перед включением в
                сценарий.
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
                        "Тип не установлен"}
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
          {(!editing || !detail.data?.can_edit) && detail.data && (
            <GenerationExample key={detail.data.id} card={detail.data} />
          )}
          {(!editing || !detail.data?.can_edit) && (
            <Stack direction="row" spacing={1} sx={styles.actions}>
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
