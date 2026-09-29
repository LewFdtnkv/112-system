import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Box,
  Button,
  Collapse,
  Stack,
  TableCell,
  TableRow,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import type { ErrorCardRowProps } from "../types";
import { heatStyle, styles } from "../styles";

export function ErrorCardRow({ card, skills }: ErrorCardRowProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TableRow>
        <TableCell sx={styles.cardTitle}>
          <Button
            fullWidth
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            endIcon={open ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          >
            {card.title}
          </Button>
          <Typography variant="body2">
            Оператор {card.role === "dds" ? "ДДС" : "112"} · {card.students}{" "}
            учеников
          </Typography>
        </TableCell>
        <TableCell align="right">
          {card.checked}
          {card.checked < 5 && (
            <Typography variant="caption" component="div">
              Мало данных
            </Typography>
          )}
        </TableCell>
        <TableCell align="right">
          {card.errors} из {card.checked}
          <Typography variant="body2">{card.error_percent}%</Typography>
        </TableCell>
        {skills.map((skill) => {
          const stat = card.skills[skill.key];
          return (
            <TableCell
              key={skill.key}
              sx={stat ? heatStyle(stat.error_percent) : styles.heat}
            >
              {stat ? (
                <>
                  <strong>{stat.error_percent}%</strong>
                  <Typography variant="caption" component="div">
                    {stat.errors} из {stat.checked}
                  </Typography>
                </>
              ) : (
                <span aria-label="Не проверялось">—</span>
              )}
            </TableCell>
          );
        })}
      </TableRow>
      <TableRow>
        <TableCell colSpan={3 + skills.length} padding="none">
          <Collapse in={open} unmountOnExit>
            <Stack spacing={1} sx={styles.details}>
              <Typography sx={styles.heading}>
                Частые ошибки в этой карточке
              </Typography>
              {card.fields.length ? (
                card.fields.map((f) => (
                  <Typography key={f.key}>
                    {f.label}: {f.errors} из {f.checked} проверок (
                    {f.error_percent}%)
                  </Typography>
                ))
              ) : (
                <Typography>В проверенных полях ошибок нет.</Typography>
              )}
              {!!card.examples.length && (
                <Box>
                  <Typography variant="body2">
                    Примеры работ с ошибками
                  </Typography>
                  {card.examples.map((e) => (
                    <Button
                      key={`${e.lesson_id}:${e.student_id}:${e.position}`}
                      component={Link}
                      to={`/results/${e.lesson_id}?student=${e.student_id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {e.student} · карточка {e.position}
                    </Button>
                  ))}
                </Box>
              )}
            </Stack>
          </Collapse>
        </TableCell>
      </TableRow>
    </>
  );
}
