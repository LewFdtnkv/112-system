import {
  activeFeatureDefinitions,
  updateFeatureAnswer,
} from "@/shared/lib/featureValues";
import { ArmField, ArmIconButton } from "@/shared/ui/arm";
import { FeatureInput } from "@/shared/ui/FeatureInput";
import type { CardCategoryEditorProps } from "../types/CardCategoryEditor";
export function CardClassificationQuestionnaire({
  editor,
  disabled,
  categoryName,
}: CardCategoryEditorProps) {
  const { fields, setDetail } = editor;
  if (!fields.categoryId) return null;
  return (
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
              data-guide-target="additional_fields.details.classificationDescription"
              label="Уточнение типа происшествия"
              inline
              disabled={disabled}
              value={fields.details?.classificationDescription ?? ""}
              onChange={(event) =>
                setDetail("classificationDescription", event.target.value)
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
              onChange={(value) =>
                editor.setField(
                  "ekpAnswers",
                  updateFeatureAnswer(
                    editor.remote.features ?? [],
                    fields.ekpAnswers,
                    feature.key,
                    value,
                  ),
                )
              }
            />
          ))}
        </div>
      </div>
    </>
  );
}
