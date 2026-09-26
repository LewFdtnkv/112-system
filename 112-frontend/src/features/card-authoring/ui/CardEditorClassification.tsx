import { ValidatedTextField as TextField } from "@/shared/ui/form-validation";
import { cardFlagFields } from "@/entities/incident-card";
import { Alert, MenuItem } from "@mui/material";
import type { CardEditorPanelProps } from "../types/CardEditorPanels";
import { CardEditorCaller } from "./CardEditorCaller";

export function CardEditorClassification({
  editor,
  initial,
}: Pick<CardEditorPanelProps, "editor" | "initial">) {
  const { flags, setFlag, silent } = editor;
  return (
    <>
      <h4>Отметки над типом происшествия</h4>
      <p>
        Для оператора 112 укажите эти обстоятельства в сообщении заявителя. «Не
        оценивать» оставляет отметку вне автопроверки. Для ДДС отметки уже
        заполнены во входящей карточке.
      </p>
      <div className="template-input-grid">
        {cardFlagFields.map(({ key, label }) => (
          <TextField
            key={key}
            select
            label={label}
            disabled={silent && key !== "noContact" && key !== "callDropped"}
            value={flags[key] == null ? "unset" : String(flags[key])}
            onChange={(event) =>
              setFlag(
                key,
                event.target.value === "unset"
                  ? undefined
                  : event.target.value === "true",
              )
            }
          >
            <MenuItem value="unset">Не оценивать</MenuItem>
            <MenuItem value="true">Да</MenuItem>
            <MenuItem value="false">Нет</MenuItem>
          </TextField>
        ))}
      </div>
      {silent && (
        <Alert severity="info">
          Молчаливый вызов сохраняется без типа, адреса, личности заявителя,
          числа пострадавших и служб. В условии опишите тишину и наблюдения
          оператора. Неизвестные признаки не участвуют в оценке.
        </Alert>
      )}
      <CardEditorCaller editor={editor} initial={initial} />
    </>
  );
}
