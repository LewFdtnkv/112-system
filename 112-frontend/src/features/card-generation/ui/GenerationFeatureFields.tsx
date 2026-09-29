import {
  activeFeatureDefinitions,
  updateFeatureAnswer,
} from "@/shared/lib/featureValues";
import { FeatureInput } from "@/shared/ui/FeatureInput";
import { Button } from "@mui/material";
import type { CardGenerationPanelProps } from "../types/CardGenerationPanels";

export function GenerationFeatureFields({ model }: CardGenerationPanelProps) {
  if (!model.features.length) return null;
  return (
    <>
      <h3>Признаки происшествия</h3>
      <p>Не выбранное значение — «Случайно». Повторный клик отменяет выбор.</p>
      <div className="generation-grid">
        {activeFeatureDefinitions(model.features, model.p.feature_answers).map(
          (feature) => (
            <div key={feature.key}>
              <FeatureInput
                requireAnswer={false}
                validationName={`parameters.feature_answers.${feature.key}`}
                feature={feature}
                value={model.p.feature_answers?.[feature.key]}
                onChange={(value) => {
                  model.change({
                    feature_answers: updateFeatureAnswer(
                      model.features,
                      model.p.feature_answers,
                      feature.key,
                      value,
                    ),
                  });
                }}
              />
              <Button
                size="small"
                onClick={() => {
                  model.change({
                    feature_answers: updateFeatureAnswer(
                      model.features,
                      model.p.feature_answers,
                      feature.key,
                      undefined,
                    ),
                  });
                }}
              >
                Случайно
              </Button>
            </div>
          ),
        )}
      </div>
    </>
  );
}
