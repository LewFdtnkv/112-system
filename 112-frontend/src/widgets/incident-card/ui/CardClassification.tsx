import {
  frequentIncidentCategoryIds,
  getCategoryName,
  incidentCategories,
} from "@/entities/incident-card";
import {
  activeFeatureDefinitions,
  featureText,
  updateFeatureAnswer,
} from "@/shared/lib/featureValues";
import { ArmField, ArmIconButton } from "@/shared/ui/arm";
import { FeatureInput } from "@/shared/ui/FeatureInput";
import { Fragment, useState } from "react";
import type { Props } from "../types/CardClassification";
export function CardClassification({
  editor,
  disabled,
  viewing,
  onVictims,
}: Props) {
  const { fields, setDetail } = editor;
  const [query, setQuery] = useState("");
  const [choosing, setChoosing] = useState(false);
  const term = query.trim();
  const showResults = choosing && term.length >= 2;
  const popular = editor.remote
    ? (editor.remote.popularCategories ?? [])
    : frequentIncidentCategoryIds.map((id) =>
        incidentCategories.find((category) => category.id === id)!,
      );
  const choices = showResults
    ? editor.remote
      ? editor.remote.categories
      : incidentCategories.filter((category) =>
          category.name
            .toLocaleLowerCase("ru")
            .includes(term.toLocaleLowerCase("ru")),
        )
    : popular.slice(0, 11);
  const choose = (id: string) => {
    editor.setCategory(id);
    setQuery("");
    editor.remote?.search("");
    setChoosing(false);
  };
  const categoryName =
    editor.remote?.categoryName || getCategoryName(fields.categoryId);
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
            {fields.categoryId === "fire" ? "Происшествие 101" : categoryName}
          </h3>
          <p>
            {editor.remote?.features?.length
              ? editor.remote.features
                  .map(
                    (f) =>
                      `${f.label}: ${featureText(fields.ekpAnswers?.[f.key])}`,
                  )
                  .join(". ")
              : [
                  fields.details?.classificationDescription,
                  ...Object.values(answers).flat(),
                ]
                  .filter(Boolean)
                  .join(". ") || "Уточняющие признаки не указаны."}
          </p>
          <p>
            Класс.: <strong>{categoryName}</strong>
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
                editor.remote?.search(e.target.value);
                setChoosing(true);
              }}
            />
            {choosing && term.length < 2 && (
              <small className="arm-category-hint">
                Введите не менее 2 символов для поиска
              </small>
            )}
            {(showResults || (!fields.categoryId && !term)) && (
              <div
                className={
                  showResults ? "arm-category-results" : "arm-category-choices"
                }
              >
                {choices.map((category) => (
                  <button
                    disabled={disabled}
                    key={category.id}
                    onClick={() => choose(category.id)}
                  >
                    {category.name}
                  </button>
                ))}
                {!showResults && choices.length > 0 && (
                  <p className="arm-category-significant">
                    Значимые типы происшествий:
                  </p>
                )}
                {editor.remote?.searching && <span>Загрузка…</span>}
                {editor.remote?.error && (
                  <span role="alert">{editor.remote.error}</span>
                )}
                {showResults &&
                  choices.length === 0 &&
                  !editor.remote?.searching && (
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
                    : categoryName}
                </span>
                <ArmIconButton
                  icon="close"
                  label="Убрать тип происшествия"
                  disabled={disabled}
                  onClick={() => editor.setCategory("")}
                />
              </div>
              <div
                className={`arm-questionnaire ${editor.remote ? "arm-questionnaire--server" : ""}`}
              >
                <h3>
                  {fields.categoryId === "fire"
                    ? "Происшествие 101"
                    : categoryName}
                </h3>
                <div className="arm-questionnaire__body">
                  {editor.remote && (
                    <div className="arm-question">
                      <span>Уточнение</span>
                      <ArmField
                        label="Уточнение типа происшествия"
                        inline
                        disabled={disabled}
                        value={fields.details?.classificationDescription ?? ""}
                        onChange={(e) =>
                          setDetail("classificationDescription", e.target.value)
                        }
                      />
                    </div>
                  )}
                  {activeFeatureDefinitions(
                    editor.remote?.features ?? [],
                    fields.ekpAnswers,
                  ).map((feature) => (
                    <FeatureInput
                      key={feature.key}
                      feature={feature}
                      disabled={disabled}
                      value={fields.ekpAnswers?.[feature.key]}
                      onChange={(value) => {
                        editor.setField(
                          "ekpAnswers",
                          updateFeatureAnswer(
                            editor.remote?.features ?? [],
                            fields.ekpAnswers,
                            feature.key,
                            value,
                          ),
                        );
                      }}
                    />
                  ))}
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
