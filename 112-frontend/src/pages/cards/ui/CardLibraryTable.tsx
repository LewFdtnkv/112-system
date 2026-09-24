import { GenerationRows } from "@/features/card-generation";
import { rowAction } from "@/shared/lib/rowAction";
import {
  Button,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
} from "@mui/material";
import { styles } from "../styles/CardsPage";
import type {
  CardLibraryRowProps,
  CardLibraryTableProps,
} from "../types/CardLibraryTable";

function CardLibraryRow({ card, onEdit, onOpen }: CardLibraryRowProps) {
  return (
    <TableRow key={card.id} hover {...rowAction(() => onOpen(card.id))}>
      <TableCell>
        <Button className="card-library-title" onClick={() => onOpen(card.id)}>
          {card.title}
        </Button>
        {card.generated_by_ai && <small>Сгенерирована</small>}
        <small>
          {card.scenario_count
            ? "Используется · только просмотр"
            : "Доступна для редактирования"}
        </small>
      </TableCell>
      <TableCell>
        <span>{card.incident_name}</span>
        <small title={card.classifier_label} className="card-library-clamp">
          {card.classifier_label}
        </small>
      </TableCell>
      <TableCell>
        <span className="card-library-clamp" title={card.address_text}>
          {card.address_text || "—"}
        </span>
      </TableCell>
      <TableCell>
        <div className="card-library-services">
          {card.recipients.length ? (
            card.recipients
              .slice(0, 2)
              .map((service) => (
                <Chip
                  key={service.service_id}
                  size="small"
                  label={service.short_name || service.name}
                  title={service.name}
                />
              ))
          ) : (
            <span>Без оповещения</span>
          )}
          {card.recipients.length > 2 && (
            <small
              title={card.recipients
                .slice(2)
                .map((service) => service.name)
                .join("; ")}
            >
              Ещё {card.recipients.length - 2}
            </small>
          )}
        </div>
      </TableCell>
      <TableCell align="center">{card.scenario_count}</TableCell>
      <TableCell>
        <time dateTime={card.updated_at}>
          {new Date(card.updated_at).toLocaleDateString("ru-RU", {
            timeZone: "Europe/Moscow",
          })}
          <small>
            {new Date(card.updated_at).toLocaleTimeString("ru-RU", {
              timeZone: "Europe/Moscow",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </small>
        </time>
      </TableCell>
      <TableCell align="center" className="card-library-actions">
        <Tooltip
          title={
            card.scenario_count
              ? "Карточка уже включена в сценарий. Редактирование недоступно."
              : "Изменить карточку"
          }
        >
          <span>
            <Button
              size="small"
              disabled={card.scenario_count > 0}
              aria-label={`Редактировать карточку «${card.title}»`}
              onClick={() => onEdit(card.id)}
            >
              Изменить
            </Button>
          </span>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
}

export function CardLibraryTable({
  cards,
  generationJobs,
  onEdit,
  onOpen,
}: CardLibraryTableProps) {
  return (
    <TableContainer>
      <Table className="card-library-table" aria-label="Библиотека карточек">
        <colgroup>
          <col style={styles.titleColumn} />
          <col style={styles.incidentColumn} />
          <col style={styles.addressColumn} />
          <col style={styles.servicesColumn} />
          <col style={styles.usageColumn} />
          <col style={styles.updatedColumn} />
          <col style={styles.actionsColumn} />
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
          <GenerationRows jobs={generationJobs} />
          {cards.map((card) => (
            <CardLibraryRow
              key={card.id}
              card={card}
              onEdit={onEdit}
              onOpen={onOpen}
            />
          ))}
          {!cards.length && !generationJobs.length && (
            <TableRow>
              <TableCell colSpan={7}>Карточки не найдены.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TableContainer>
  );
}
