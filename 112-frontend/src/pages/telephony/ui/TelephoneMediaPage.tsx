import {
  Alert,
  Stack,
  TextField,
  Typography,
  Table,
  TableContainer,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TablePagination,
  CircularProgress,
} from "@mui/material";
import { PageHeader } from "@/shared/ui/PageHeader";
import { getApiError } from "@/shared/api";
import { RecordingStatus } from "@/entities/recording";
import { useRecordingLibrary } from "../model/useRecordingLibrary";
import "../styles/telephony.scss";

const purposes = {
  caller: "Заявитель · 112",
  greeting: "Бригада · приветствие",
  acknowledgment: "Бригада · подтверждение",
};

export function TelephoneMediaPage() {
  const { page, setPage, query, search, recordings } = useRecordingLibrary();
  return (
    <Stack spacing={2} className="telephony-page">
      <PageHeader title="Записи учебных звонков" />
      <Typography>
        Загружайте записи или создавайте их из текста в карточке: сообщение
        заявителя — в разделе «Оператор 112», голоса бригад — в разделе
        «Оператор ДДС». Здесь можно прослушать записи и посмотреть, где они
        используются.
      </Typography>
      <TextField
        label="Найти запись"
        value={query}
        onChange={(e) => search(e.target.value)}
      />
      {recordings.error && (
        <Alert severity="error">{getApiError(recordings.error).message}</Alert>
      )}
      {recordings.isPending && (
        <CircularProgress aria-label="Загрузка записей" />
      )}
      <TableContainer>
        <Table aria-label="Библиотека записей" className="recordings-table">
          <TableHead>
            <TableRow>
              <TableCell>Запись</TableCell>
              <TableCell>Назначение</TableCell>
              <TableCell>Используется</TableCell>
              <TableCell>Прослушивание</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {recordings.data?.items.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.title}</TableCell>
                <TableCell>{purposes[r.purpose]}</TableCell>
                <TableCell>
                  {r.usages.length
                    ? r.usages.map((u) => (
                        <Typography key={`${u.kind}:${u.id}`} variant="body2">
                          {u.kind === "card" ? "Карточка" : "Сценарий"}:{" "}
                          {u.title}
                        </Typography>
                      ))
                    : "Пока не используется"}
                </TableCell>
                <TableCell>
                  <RecordingStatus recording={r} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      {!recordings.isPending && recordings.data?.total === 0 && (
        <Typography>
          {query
            ? "По запросу ничего не найдено."
            : "Записей пока нет. Добавьте первую в редакторе карточки."}
        </Typography>
      )}
      <TablePagination
        component="div"
        count={recordings.data?.total ?? 0}
        page={page}
        rowsPerPage={20}
        rowsPerPageOptions={[20]}
        labelDisplayedRows={({ from, to, count }) =>
          `${from}–${to} из ${count}`
        }
        onPageChange={(_, value) => setPage(value)}
      />
    </Stack>
  );
}
