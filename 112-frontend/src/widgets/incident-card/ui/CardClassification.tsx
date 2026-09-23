import { cardFlagFields } from "@/entities/incident-card";
import { CardFlagSummary } from "./CardFlagSummary";
import {
  useIncidentCardStore,
  useCardSkillDisabled,
} from "../model/IncidentCardContext";
import {
  activeFeatureDefinitions,
  featureText,
  updateFeatureAnswer,
} from "@/shared/lib/featureValues";
import { ArmField, ArmIconButton } from "@/shared/ui/arm";
import { FeatureInput } from "@/shared/ui/FeatureInput";
import { useState } from "react";
import type { Props } from "../types/CardClassification";
export function CardClassification({ viewing }: Props) {
  const editor = useIncidentCardStore((state) => state.editor);
  const disabled = useCardSkillDisabled("classification");
  const { fields, setDetail } = editor;
  const [query, setQuery] = useState("");
  const [choosing, setChoosing] = useState(false);
  const term = query.trim();
  const showResults = choosing && term.length >= 2;
  const choices = showResults
    ? editor.remote.categories
    : (editor.remote.popularCategories ?? []).slice(0, 11);
  const choose = (id: string) => {
    editor.setCategory(id);
    setQuery("");
    editor.remote.search("");
    setChoosing(false);
  };
  const categoryName =
    editor.remote.categoryName ||
    (fields.details?.noContact ? "Тип не установлен" : "Тип не выбран");
  const hasVictims =
    fields.details?.hasVictims ?? (fields.victimsCount ?? 0) > 0;
  const answers = fields.details?.clarifications ?? {};
  return (
    <section
      data-learning-target="classification"
      className="arm-classification"
      aria-label="Что случилось"
    >
      {viewing ? (
        <div className="arm-victim-summary">
          <div>
            {cardFlagFields.map(({ key, label }) => (
              <CardFlagSummary
                key={key}
                label={label}
                value={
                  fields.details?.noContact &&
                  fields.details?.[key] == null &&
                  key !== "callDropped"
                    ? "неизвестно"
                    : key === "hasVictims"
                      ? hasVictims
                        ? "да"
                        : "нет"
                      : fields.details?.[key]
                        ? "да"
                        : "нет"
                }
              />
            ))}
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
              onClick={() => editor.setVictims(!hasVictims)}
              aria-pressed={hasVictims}
              className={hasVictims ? "is-selected" : ""}
            >
              Пострадавшие
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
              disabled={disabled}
              aria-pressed={fields.details?.noContact ?? false}
              onClick={() => setDetail("noContact", !fields.details?.noContact)}
            >
              нет контакта
            </button>
            <button
              disabled={disabled}
              aria-pressed={fields.details?.callDropped ?? false}
              onClick={() =>
                setDetail("callDropped", !fields.details?.callDropped)
              }
            >
              срыв звонка
            </button>
          </div>
        </div>
      )}
      {viewing ? (
        <div className="arm-classification-view">
          <h3>{categoryName}</h3>
          <p>
            {editor.remote.features?.length
              ? activeFeatureDefinitions(
                  editor.remote.features,
                  fields.ekpAnswers,
                )
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
                editor.remote.search(e.target.value);
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
                {editor.remote.searching && <span>Загрузка…</span>}
                {editor.remote.error && (
                  <span role="alert">{editor.remote.error}</span>
                )}
                {showResults &&
                  choices.length === 0 &&
                  !editor.remote.searching && (
                    <span>Тип происшествия не найден.</span>
                  )}
              </div>
            )}
          </div>
          {fields.categoryId && (
            <>
              <div className="arm-category-tab">
                <span>{categoryName}</span>
                <ArmIconButton
                  icon="close"
                  label="Убрать тип происшествия"
                  disabled={disabled}
                  onClick={() => editor.setCategory("")}
                />
              </div>
              <div className="arm-questionnaire arm-questionnaire--server">
                <h3>{categoryName}</h3>
                <div className="arm-questionnaire__body">
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
                  {activeFeatureDefinitions(
                    editor.remote.features ?? [],
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
                            editor.remote.features ?? [],
                            fields.ekpAnswers,
                            feature.key,
                            value,
                          ),
                        );
                      }}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
