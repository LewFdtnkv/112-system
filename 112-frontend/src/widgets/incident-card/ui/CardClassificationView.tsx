import { cardFlagFields } from "@/entities/incident-card";
import {
  activeFeatureDefinitions,
  featureText,
} from "@/shared/lib/featureValues";
import { ArmIconButton } from "@/shared/ui/arm";
import type { CardClassificationViewProps } from "../types/CardClassificationView";
import { CardFlagSummary } from "./CardFlagSummary";
export function CardClassificationView({
  editor,
  categoryName,
  hasVictims,
}: CardClassificationViewProps) {
  const { fields } = editor;
  const answers = fields.details?.clarifications ?? {};
  return (
    <>
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
      <div className="arm-classification-view">
        <h3>{categoryName}</h3>
        <p>
          {editor.remote.features?.length
            ? activeFeatureDefinitions(
                editor.remote.features,
                fields.ekpAnswers,
              )
                .map(
                  (feature) =>
                    `${feature.label}: ${featureText(fields.ekpAnswers?.[feature.key])}`,
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
    </>
  );
}
