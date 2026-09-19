import { useEffect, useState } from "react";
import {
  getMissingCardFields,
  getIncidentTagGroups,
  incidentCategories,
  readCardDraft,
  writeCardDraft,
  type IncidentAddress,
  type IncidentCard,
  type IncidentCardFields,
  type IncidentCardDetails,
  type IncidentPhones,
  type ResponseService,
} from "@/entities/incident-card";
export interface IncidentEditorOptions {
  card: IncidentCard;
  sessionId?: string;
  log: readonly string[];
  isSubmitted: boolean;
  isCallAccepted: boolean;
  onCommitAction: (fields: IncidentCardFields, action: string) => void;
  onSubmit: (fields: IncidentCardFields) => void;
}
const missingFieldLabels: Record<string, string> = {
  categoryId: "тип происшествия",
  address: "адрес (улица и дом)",
  description: "сообщение",
  operatorAction: "действие оператора в учебном комментарии",
  services: "службы реагирования",
};
export function useIncidentEditor({
  card,
  sessionId,
  log,
  isSubmitted,
  isCallAccepted,
  onCommitAction,
  onSubmit,
}: IncidentEditorOptions) {
  const [fields, setFields] = useState<IncidentCardFields>(() =>
    isSubmitted
      ? card.fields
      : (readCardDraft(sessionId, card.id) ?? card.fields),
  );
  const [error, setError] = useState<string>();
  const tagGroups = getIncidentTagGroups(fields.categoryId);

  /** Черновик переживает перезагрузку и кратковременный обрыв связи. */
  useEffect(() => {
    if (!isSubmitted) writeCardDraft(sessionId, card.id, fields);
  }, [card.id, fields, isSubmitted, sessionId]);

  const setField = <Key extends keyof IncidentCardFields>(
    key: Key,
    value: IncidentCardFields[Key],
  ) => {
    setFields((current) => ({ ...current, [key]: value }));
    setError(undefined);
  };

  const setAddressField = <Key extends keyof IncidentAddress>(
    key: Key,
    value: IncidentAddress[Key],
  ) => {
    setFields((current) => ({
      ...current,
      address: { ...current.address, [key]: value },
    }));
    setError(undefined);
  };

  const setPhoneField = <Key extends keyof IncidentPhones>(
    key: Key,
    value: IncidentPhones[Key],
  ) => {
    setFields((current) => ({
      ...current,
      phones: { ...current.phones, [key]: value },
    }));
    setError(undefined);
  };

  const toggleService = (service: ResponseService) =>
    setFields((current) => {
      const services = current.services.includes(service)
        ? current.services.filter((item) => item !== service)
        : [...current.services, service];

      return { ...current, services };
    });

  const setCategory = (categoryId: string) => {
    const category = incidentCategories.find((item) => item.id === categoryId);
    setFields((current) => ({
      ...current,
      categoryId,
      services: category?.defaultServices ?? [],
      details: { ...current.details, clarifications: {} },
    }));
    setError(undefined);
  };

  const setDetail = <Key extends keyof IncidentCardDetails>(
    key: Key,
    value: IncidentCardDetails[Key],
  ) =>
    setFields((current) => ({
      ...current,
      details: { ...current.details, [key]: value },
    }));
  const toggleTag = (group: string, tag: string) =>
    setFields((current) => {
      const answers = current.details?.clarifications ?? {};
      const selected = answers[group] ?? [];
      return {
        ...current,
        details: {
          ...current.details,
          clarifications: {
            ...answers,
            [group]: selected.includes(tag)
              ? selected.filter((item) => item !== tag)
              : [...selected, tag],
          },
        },
      };
    });

  const commitAction = () => {
    if (isSubmitted || !isCallAccepted) return;
    const action = fields.operatorAction.trim();
    if (!action) {
      setError("Опишите действие оператора, прежде чем фиксировать его.");
      return;
    }

    onCommitAction(fields, action);
    setFields({ ...fields, operatorAction: "" });
    setError(undefined);
  };

  const submit = () => {
    if (isSubmitted || !isCallAccepted) return;
    const hasRecordedAction = log.some((entry) =>
      entry.startsWith("Оператор: "),
    );
    const missing = getMissingCardFields(fields).filter(
      (field) => field !== "operatorAction" || !hasRecordedAction,
    );
    if (missing.length > 0) {
      setError(
        `Заполните: ${missing
          .map((field) => missingFieldLabels[field] ?? field)
          .join(", ")}.`,
      );
      return;
    }

    onSubmit(fields);
    setFields({ ...fields, status: "closed" });
    setError(undefined);
  };

  return {
    fields,
    error,
    tagGroups,
    setField,
    setAddressField,
    setPhoneField,
    setDetail,
    toggleService,
    setCategory,
    toggleTag,
    commitAction,
    submit,
  };
}
export type IncidentEditor = ReturnType<typeof useIncidentEditor>;
