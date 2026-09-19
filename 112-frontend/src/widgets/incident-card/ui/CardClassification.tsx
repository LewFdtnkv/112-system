import { Fragment, useState } from "react";
import {
  getCategoryName,
  incidentCategories,
  frequentIncidentCategoryIds,
} from "@/entities/incident-card";
import type { IncidentEditor } from "@/features/incident-editing";
import { ArmField, ArmIconButton } from "@/shared/ui/arm";

interface Props {
  editor: IncidentEditor;
  disabled: boolean;
  viewing: boolean;
  onVictims: () => void;
}
export function CardClassification({
  editor,
  disabled,
  viewing,
  onVictims,
}: Props) {
  const { fields, setDetail } = editor;
  const [query, setQuery] = useState("");
  const [choosing, setChoosing] = useState(false);
  const choices = (
    query || choosing
      ? incidentCategories
      : frequentIncidentCategoryIds.map((id) =>
          incidentCategories.find((category) => category.id === id)!,
        )
  ).filter((category) =>
    category.name
      .toLocaleLowerCase("ru")
      .includes(query.toLocaleLowerCase("ru")),
  );
  const answers = fields.details?.clarifications ?? {};
  return (
    <section className="arm-classification" aria-label="Что случилось">
      {viewing ? (
        <div className="arm-victim-summary">
          <div>
            Пострадавшие: {fields.victimsCount ?? "нет"} Отказ от скорой:{" "}
            {fields.details?.refusedAmbulance ? "да" : "нет"} Заблокированные:{" "}
            {fields.details?.blocked ? "да" : "нет"}
          </div>
          <div>
            <button disabled>ЧС ϟ</button>
            <button disabled>ЧП ⚠</button>
            <ArmIconButton icon="edit" label="Изменить признаки" disabled />
          </div>
        </div>
      ) : (
        <div className="arm-victim-bar">
          <div className="arm-victim-bar__group">
            <button
              disabled={disabled}
              onClick={onVictims}
              className={fields.victimsCount ? "is-selected" : ""}
            >
              Пострадавшие
              {fields.victimsCount ? `: ${fields.victimsCount}` : ""}
            </button>
            <button
              disabled={disabled}
              aria-pressed={fields.details?.refusedAmbulance ?? false}
              onClick={() =>
                setDetail("refusedAmbulance", !fields.details?.refusedAmbulance)
              }
            >
              Нет на месте/
              <br />
              Отказ от скорой
            </button>
            <button
              disabled={disabled}
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
              disabled
              title="Завершение пустого вызова не предусмотрено текущим заданием"
            >
              нет контакта
            </button>
            <button
              disabled
              title="Срыв звонка не предусмотрен текущим заданием"
            >
              срыв звонка
            </button>
          </div>
        </div>
      )}
      {viewing ? (
        <div className="arm-classification-view">
          <h3>
            {fields.categoryId === "fire"
              ? "Происшествие 101"
              : getCategoryName(fields.categoryId)}
          </h3>
          <p>
            {Object.values(answers).flat().join(". ") ||
              "Уточняющие признаки не указаны."}
          </p>
          <p>
            Класс.: <strong>{getCategoryName(fields.categoryId)}</strong>
          </p>
          <p>[ВИС] Класс.:</p>
        </div>
      ) : (
        <>
          <div
            className="arm-category-search"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                setChoosing(false);
            }}
          >
            <ArmField
              label="Введите тип происшествия"
              aria-label="Тип происшествия"
              placeholder={
                fields.categoryId
                  ? "добавить тип происшествия"
                  : "ЧТО СЛУЧИЛОСЬ?"
              }
              value={query}
              disabled={disabled}
              onFocus={() => setChoosing(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setChoosing(true);
              }}
            />
            {(choosing || !fields.categoryId) && (
              <div
                className={
                  choosing ? "arm-category-results" : "arm-category-choices"
                }
              >
                {choices.map((category) => (
                  <button
                    disabled={disabled}
                    key={category.id}
                    onClick={() => {
                      editor.setCategory(category.id);
                      setQuery("");
                      setChoosing(false);
                    }}
                  >
                    {category.name}
                  </button>
                ))}
                {!query && !choosing && (
                  <p className="arm-category-significant">
                    Значимые типы происшествий:
                  </p>
                )}
                {choices.length === 0 && (
                  <span>Тип происшествия не найден.</span>
                )}
              </div>
            )}
          </div>
          {fields.categoryId && (
            <>
              <div className="arm-category-tab">
                <span>
                  {fields.categoryId === "fire"
                    ? "Происшествие 101"
                    : getCategoryName(fields.categoryId)}
                </span>
                <ArmIconButton
                  icon="close"
                  label="Убрать тип происшествия"
                  disabled={disabled}
                  onClick={() => editor.setCategory("")}
                />
              </div>
              <div className="arm-questionnaire">
                <h3>
                  {fields.categoryId === "fire"
                    ? "Происшествие 101"
                    : getCategoryName(fields.categoryId)}
                </h3>
                <div className="arm-questionnaire__body">
                  {editor.tagGroups.map((group) => (
                    <Fragment key={group.label}>
                      <div className="arm-question">
                        <span>{group.label}</span>
                        <div>
                          {group.options.map((option) => (
                            <button
                              disabled={disabled}
                              key={option}
                              aria-pressed={
                                answers[group.label]?.includes(option) ?? false
                              }
                              onClick={() =>
                                editor.toggleTag(group.label, option)
                              }
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                      {group.label === "Дом (пламя, дым)" && (
                        <div className="arm-question">
                          <span>Этажность здания</span>
                          <ArmField
                            label="Этажность здания"
                            inline
                            type="number"
                            min={1}
                            disabled={disabled}
                            value={fields.details?.buildingFloors ?? ""}
                            onChange={(event) =>
                              setDetail("buildingFloors", event.target.value)
                            }
                          />
                        </div>
                      )}
                    </Fragment>
                  ))}
                  {fields.categoryId === "fire" && (
                    <div className="arm-question">
                      <span>Описание</span>
                      <ArmField
                        label="Описание типа происшествия"
                        inline
                        disabled={disabled}
                        value={fields.details?.classificationDescription ?? ""}
                        onChange={(event) =>
                          setDetail(
                            "classificationDescription",
                            event.target.value,
                          )
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
