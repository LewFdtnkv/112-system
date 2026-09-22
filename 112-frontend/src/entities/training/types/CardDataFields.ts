import type { FeatureDefinition } from "@/shared/lib/featureValues";
import type { CardData } from "../model/types";
export type CardDataFieldsProps = {
  data: CardData;
  features?: FeatureDefinition[];
};
