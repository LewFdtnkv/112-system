import "./feature-input.scss";
import { useState } from "react";
import {
  type FeatureDefinition,
  type FeatureValue,
} from "@/shared/lib/featureValues";

/** Generic structured input, shared by reference answers and ARM fields. */
export function FeatureInput({
  feature,
  value,
  onChange,
  disabled,
  condition = false,
}: {
  feature: FeatureDefinition;
  value: FeatureValue | undefined;
  onChange: (value: FeatureValue | undefined) => void;
  disabled?: boolean;
  condition?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const multiple = feature.type === "array";
  const options: (boolean | string)[] =
    !feature.type || feature.type === "boolean"
      ? [true, false]
      : (feature.options ?? []);
  const selected = Array.isArray(value) ? value : [];
  return (
    <div className="structured-feature arm-question">
      <span>
        {feature.label}
        {!condition && (feature.required !== false ? " *" : " (необязательно)")}
      </span>
      <div>
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
