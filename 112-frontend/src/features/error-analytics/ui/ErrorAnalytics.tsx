import {
  Alert,
  Box,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { userApi, userKeys } from "@/entities/user";
import { ServerSelect } from "@/shared/ui/ServerSelect";
import { PageControls, QueryState } from "@/shared/ui/QueryState";
import { useErrorAnalytics } from "../model/useErrorAnalytics";
import { styles } from "../styles";
import type { ErrorAnalyticsProps } from "../types";
import { ErrorCardRow } from "./ErrorCardRow";

export function ErrorAnalytics({ track }: ErrorAnalyticsProps) {
  const { filters, change, query, setPage } = useErrorAnalytics(track);
  const data = query.data;
  return (
    <Stack spacing={2}>
      <Typography variant="h5" component="h2">
        Типичные ошибки
      </Typography>
      <Typography color="text.secondary">
        Где ученики чаще ошибаются. Доля ошибок рассчитана от проверенных
        попыток; частично верные ответы тоже учитываются как ошибки.
      </Typography>
      <Box sx={styles.filters}>
        <ServerSelect
          label="Группа (пусто — все мои ученики)"
          queryKey={userKeys.groupOptions}
          value={filters.group}
          onChange={(group) => change({ group })}
          load={async (q, signal) =>
            (await userApi.groups({ q }, signal)).items.map((g) => ({
              id: g.id,
              label: g.name,
            }))
          }
        />
        <TextField
          select
          label="Оператор"
          value={filters.role}
          onChange={(e) => change({ role: e.target.value })}
        >
          <MenuItem value="all">112 и ДДС</MenuItem>
          <MenuItem value="operator_112">Оператор 112</MenuItem>
          <MenuItem value="dds">Оператор ДДС</MenuItem>
        </TextField>
        <TextField
          select
          label="Период завершения карточек"
          value={filters.days}
          onChange={(e) => change({ days: Number(e.target.value) })}
        >
          {[30, 90, 365].map((days) => (
            <MenuItem value={days} key={days}>
              Последние {days} дней
            </MenuItem>
          ))}
        </TextField>
      </Box>
      <QueryState
        pending={query.isPending}
        error={query.error}
        retry={() => void query.refetch()}
      >
        {data && (
          <>
            <Box sx={styles.metrics}>
              {[
                ["Проверено попыток", data.summary.checked],
                [
                  "С ошибками",
                  `${data.summary.errors} (${data.summary.error_percent}%)`,
                ],
                ["Учеников", data.summary.students],
                ["Учебных карточек", data.cards.total],
              ].map(([label, value]) => (
                <Box key={label} sx={styles.metric}>
                  <Typography color="text.secondary">{label}</Typography>
                  <Typography variant="h4">{value}</Typography>
                </Box>
              ))}
            </Box>
            {!!data.summary.pending_ai && (
              <Alert severity="info">
                Ожидают завершения проверки ИИ: {data.summary.pending_ai}. В
                статистику пока не включены.
              </Alert>
            )}
            {!!data.summary.teacher_reviewed && (
              <Alert severity="info">
                Исключены после пересмотра преподавателем:{" "}
                {data.summary.teacher_reviewed}. Общая оценка занятия не
                уточняет, какие ошибки подтверждены.
              </Alert>
            )}
            {!!data.summary.incomplete_ai && (
              <Alert severity="warning">
                Неполная проверка ИИ у {data.summary.incomplete_ai} попыток.
                Учтены только доступные проверки; спорные выводы ИИ не считаются
                ошибками.
              </Alert>
            )}
            {!!data.summary.ungraded && (
              <Typography color="text.secondary">
                Нет проверяемых результатов у {data.summary.ungraded}{" "}
                завершённых попыток.
              </Typography>
            )}
            {!data.cards.total ? (
              <Alert severity="info">
                За выбранный период нет проверенных карточек. Попробуйте другую
                группу или увеличьте период.
              </Alert>
            ) : (
              <>
                <Typography variant="h6" component="h3">
                  Карточки и проблемные навыки
                </Typography>
                <Typography variant="body2">
                  Сначала карточки с большей долей ошибок. Нажмите название для
                  подробностей. В цветных ячейках — доля попыток с ошибкой в
                  навыке; «—» означает, что навык не проверялся.
                </Typography>
                <TableContainer>
                  <Table aria-label="Тепловая карта ошибок">
                    <TableHead>
                      <TableRow>
                        <TableCell>Учебная карточка</TableCell>
                        <TableCell align="right">Попыток</TableCell>
                        <TableCell align="right">С ошибками</TableCell>
                        {data.skills.map((skill) => (
                          <TableCell key={skill.key} sx={styles.heat}>
                            {skill.label}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.cards.items.map((card) => (
                        <ErrorCardRow
                          key={card.key}
                          card={card}
                          skills={data.skills}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <PageControls
                  page={filters.page}
                  onPage={setPage}
                  total={data.cards.total}
                />
                <Typography variant="h6" component="h3">
                  10 самых частых проблем в полях
                </Typography>
                <Typography variant="body2">
                  Доля ошибок среди всех проверок этого поля за выбранный
                  период.
                </Typography>
                {data.fields.length ? (
                  <TableContainer>
                    <Table aria-label="Частые ошибки в полях">
                      <TableHead>
                        <TableRow>
                          <TableCell>Поле или действие</TableCell>
                          <TableCell>Оператор</TableCell>
                          <TableCell align="right">Ошибок / проверок</TableCell>
                          <TableCell align="right">Доля ошибок</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {data.fields.map((f) => (
                          <TableRow key={`${f.role}:${f.key}:${f.label}`}>
                            <TableCell>{f.label}</TableCell>
                            <TableCell>
                              {f.role === "dds" ? "ДДС" : "112"}
                            </TableCell>
                            <TableCell align="right">
                              {f.errors} / {f.checked}
                            </TableCell>
                            <TableCell align="right">
                              {f.error_percent}%
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Typography>
                    В проверенных полях ошибок не обнаружено.
                  </Typography>
                )}
              </>
            )}
          </>
        )}
      </QueryState>
    </Stack>
  );
}
