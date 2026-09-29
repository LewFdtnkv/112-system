import type { useCardGeneration } from "../model/useCardGeneration";

export type CardGenerationModel = ReturnType<typeof useCardGeneration>;

export type CardGenerationPanelProps = {
  model: CardGenerationModel;
};

export type TextChoiceKey =
  "locality" | "street" | "house" | "object" | "caller_name";

export type GenerationTextChoiceProps = {
  model: CardGenerationModel;
  name: TextChoiceKey;
  label: string;
  values: string[];
};
