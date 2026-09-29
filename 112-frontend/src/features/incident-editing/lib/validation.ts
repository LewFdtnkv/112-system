import {
  formatAddress,
  type IncidentCardFields,
} from "@/entities/incident-card";
import { activeFeatureDefinitions } from "@/shared/lib/featureValues";
import type { FieldIssue } from "@/shared/ui/form-validation";
import type { RemoteEditor } from "../types/useIncidentEditor";

export function incidentIssues(
  fields: IncidentCardFields,
  remote: RemoteEditor,
): FieldIssue[] {
  const issues: FieldIssue[] = [];
  const silent = fields.details?.noContact;
  if (!silent && !fields.categoryId)
    issues.push({
      path: "classifier_entry_id",
      message: "Выберите тип происшествия в блоке «Что случилось?»",
    });
  if (
    !silent &&
    remote.notificationRequired !== false &&
    !formatAddress(fields.address).trim()
  )
    issues.push({
      path: "data.address_text",
      message:
        "Укажите адрес происшествия: заполните отдельные поля или описательный адрес.",
    });
  if (!fields.description.trim())
    issues.push({
      path: "data.description",
      message: "Заполните сообщение со слов заявителя.",
    });
  if (!silent)
    for (const feature of activeFeatureDefinitions(
      remote.features ?? [],
      fields.ekpAnswers,
    )) {
      const value = fields.ekpAnswers?.[feature.key];
      if (
        feature.required !== false &&
        (value === undefined ||
          (typeof value === "string" && !value.trim()) ||
          (Array.isArray(value) && !value.length))
      )
        issues.push({
          path: `data.features.ekp.${feature.key}`,
          message: `Укажите: ${feature.label}.`,
        });
    }
  return issues;
}

export class IncidentValidationError extends Error {
  readonly issues: FieldIssue[];
  constructor(issues: FieldIssue[]) {
    super("Проверьте выделенные поля карточки.");
    this.issues = issues;
  }
}
