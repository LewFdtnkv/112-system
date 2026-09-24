import {
  incidentStatuses,
  incidentStatusLabels,
} from "@/entities/incident-card";
import { ArmIconButton, ArmSelect, ArmTextarea } from "@/shared/ui/arm";
import type { CardTrainingCommentProps } from "../types/CardTrainingComment";
export function CardTrainingComment({
  editor,
  disabled,
  viewing,
  locked,
  log,
  onClose,
  onPreview,
}: CardTrainingCommentProps) {
  const { fields } = editor;
  return (
    <section className="arm-training-comment" aria-label="Учебный комментарий">
      <h3>
        Учебный комментарий
        <ArmIconButton
          icon="close"
          label="Закрыть учебный комментарий"
          onClick={onClose}
        />
      </h3>
      <ArmSelect
        label="Статус обработки"
        disabled
        value={fields.status}
        onChange={(e) =>
          editor.setField("status", e.target.value as typeof fields.status)
        }
      >
        {incidentStatuses.map((status) => (
          <option value={status} key={status}>
            {incidentStatusLabels[status]}
          </option>
        ))}
      </ArmSelect>
      <ArmTextarea
        label="Действие оператора"
        disabled={locked("description")}
        rows={3}
        value={fields.operatorAction}
        onChange={(e) => editor.setField("operatorAction", e.target.value)}
      />
      <button
        className="arm-small-button"
        disabled={disabled}
        onClick={editor.saveDraft}
      >
        Сохранить комментарий
      </button>
      {!viewing && (
        <button className="arm-small-button" onClick={onPreview}>
          Просмотр карточки
        </button>
      )}
      <h4>Журнал действий</h4>
      {log.length ? (
        <ul>
          {log.map((entry, index) => (
            <li key={index}>{entry}</li>
          ))}
        </ul>
      ) : (
        <p>Действий пока нет.</p>
      )}
    </section>
  );
}
