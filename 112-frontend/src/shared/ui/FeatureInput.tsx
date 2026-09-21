import "@/shared/styles/feature-input.scss";
import type { FeatureInputProps } from "@/shared/types/features";
import { useState } from "react";
import { useFieldFeedback } from "./arm/FieldFeedback";

/** Generic structured input, shared by reference answers and ARM fields. */
export function FeatureInput({
  feature,
  value,
  onChange,
  disabled,
  condition = false,
}: FeatureInputProps) {
  const [draft, setDraft] = useState("");
  const feedback = useFieldFeedback(`feature:${feature.key}`);
  const multiple = feature.type === "array";
  const options: (boolean | string)[] =
    !feature.type || feature.type === "boolean"
      ? [true, false]
      : (feature.options ?? []);
  const selected = Array.isArray(value) ? value : [];
  return (
    <div
      className="structured-feature arm-question"
      data-feedback={feedback?.tone}
      title={feedback?.text}
    >
      <span
        title={
          !condition && feature.required === false
            ? "Необязательное поле"
            : undefined
        }
      >
        {feature.label}
        {!condition && feature.required !== false && " *"}
      </span>
      <div>
        {feature.type === "text" && (
          <input
            aria-label={feature.label}
            value={typeof value === "string" ? value : ""}
            maxLength={200}
            disabled={disabled}
            onChange={(e) =>
              onChange(e.target.value.trim() ? e.target.value : undefined)
            }
          />
        )}
        {options.map((option) => {
          const label =
            typeof option === "boolean" ? (option ? "Да" : "Нет") : option;
          return (
            <button
              type="button"
              key={String(option)}
              disabled={disabled}
              aria-label={`${feature.label}: ${label}`}
              aria-pressed={
                multiple ? selected.includes(String(option)) : value === option
              }
              onClick={() =>
                onChange(
                  multiple
                    ? selected.includes(String(option))
                      ? selected.filter((v) => v !== option)
                      : [...selected, String(option)]
                    : value === option
                      ? undefined
                      : option,
                )
              }
            >
              {label}
            </button>
          );
        })}
        {multiple && !options.length && (
          <>
            {selected.map((v) => (
              <button
                type="button"
                disabled={disabled}
                key={v}
                onClick={() => onChange(selected.filter((x) => x !== v))}
                aria-label={`Убрать ${v}`}
              >
                {v} ×
              </button>
            ))}
            <input
              aria-label={`Значение: ${feature.label}`}
              value={draft}
              maxLength={200}
              disabled={disabled}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button
              type="button"
              disabled={disabled || !draft.trim() || selected.length >= 30}
              onClick={() => {
                onChange([...new Set([...selected, draft.trim()])]);
                setDraft("");
              }}
            >
              Добавить значение
            </button>
          </>
        )}
      </div>
    </div>
  );
}
