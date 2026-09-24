import type { CatalogRule } from "@/entities/training";

export const normalizeCatalogRule = (rule: CatalogRule): CatalogRule => ({
  ...rule,
  features: rule.features.map((feature) => ({
    ...feature,
    options: (feature.options ?? [])
      .map((option) => option.trim())
      .filter(Boolean),
  })),
});
