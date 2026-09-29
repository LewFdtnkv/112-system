import {
  useCardSkillDisabled,
  useIncidentCardContext,
} from "../model/IncidentCardContext";
import type { Props } from "../types/CardClassification";
import { CardCategorySearch } from "./CardCategorySearch";
import { CardClassificationQuestionnaire } from "./CardClassificationQuestionnaire";
import { CardClassificationView } from "./CardClassificationView";

export function CardClassification({ viewing }: Props) {
  const editor = useIncidentCardContext().editor;
  const disabled = useCardSkillDisabled("classification");
  const { fields, setDetail } = editor;
  const categoryName =
    editor.remote.categoryName ||
    (fields.details?.noContact ? "Тип не установлен" : "Тип не выбран");
  const hasVictims =
    fields.details?.hasVictims ?? (fields.victimsCount ?? 0) > 0;
  return (
    <section
      data-learning-target="classification"
      className="arm-classification"
      aria-label="Что случилось"
    >
      {viewing ? (
        <CardClassificationView
          editor={editor}
          categoryName={categoryName}
          hasVictims={hasVictims}
        />
      ) : (
        <>
          <div className="arm-victim-bar">
            <div className="arm-victim-bar__group">
              <button
                disabled={disabled}
                data-guide-target="additional_fields.details.hasVictims"
                onClick={() => editor.setVictims(!hasVictims)}
                aria-pressed={hasVictims}
                className={hasVictims ? "is-selected" : ""}
              >
                Пострадавшие
              </button>
              <button
                disabled={disabled}
                data-guide-target="additional_fields.details.refusedAmbulance"
                aria-pressed={fields.details?.refusedAmbulance ?? false}
                onClick={() =>
                  setDetail(
                    "refusedAmbulance",
                    !fields.details?.refusedAmbulance,
                  )
                }
              >
                Нет на месте/
                <br />
                Отказ от скорой
              </button>
              <button
                disabled={disabled}
                data-guide-target="additional_fields.details.blocked"
                aria-pressed={fields.details?.blocked ?? false}
                onClick={() => setDetail("blocked", !fields.details?.blocked)}
              >
                Нет доступа/
                <br />
                Заблокированные
              </button>
            </div>
            <div className="arm-victim-bar__group arm-victim-bar__special">
              <button
                disabled={disabled}
                data-guide-target="additional_fields.details.noContact"
                aria-pressed={fields.details?.noContact ?? false}
                onClick={() =>
                  setDetail("noContact", !fields.details?.noContact)
                }
              >
                нет контакта
              </button>
              <button
                disabled={disabled}
                data-guide-target="additional_fields.details.callDropped"
                aria-pressed={fields.details?.callDropped ?? false}
                onClick={() =>
                  setDetail("callDropped", !fields.details?.callDropped)
                }
              >
                срыв звонка
              </button>
            </div>
          </div>
          <CardCategorySearch
            editor={editor}
            disabled={disabled}
            categoryName={categoryName}
          />
          <CardClassificationQuestionnaire
            editor={editor}
            disabled={disabled}
            categoryName={categoryName}
          />
        </>
      )}
    </section>
  );
}
