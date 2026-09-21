import {
  getIncidentTagGroups,
  getMissingCardFields,
  incidentCategories,
  readCardDraft,
  writeCardDraft,
  type IncidentAddress,
  type IncidentCardDetails,
  type IncidentCardFields,
  type IncidentPhones,
  type ResponseService,
} from "@/entities/incident-card";
import { getApiError } from "@/shared/api";
import { useEffect, useState } from "react";
import type { IncidentEditorOptions } from "../types/useIncidentEditor";
const missingFieldLabels: Record<string, string> = {
  categoryId: "тип происшествия",
  address: "адрес (улица и дом)",
  description: "сообщение",
  operatorAction: "действие оператора в учебном комментарии",
  services: "службы реагирования",
};
export function useIncidentEditor({
  card,
  remote,
  sessionId,
  log,
  isSubmitted,
  isCallAccepted,
  onCommitAction,
  onSubmit,
}: IncidentEditorOptions) {
  const [fields, setFields] = useState<IncidentCardFields>(() =>
    isSubmitted || remote
      ? card.fields
      : (readCardDraft(sessionId, card.id) ?? card.fields),
  );
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedFields, setSavedFields] = useState(() =>
    JSON.stringify(card.fields),
  );
  const tagGroups = remote ? [] : getIncidentTagGroups(fields.categoryId);
  const onFieldsChange = remote?.onFieldsChange;
  useEffect(() => {
    if (!isSubmitted) onFieldsChange?.(fields);
  }, [fields, isSubmitted, onFieldsChange]);

  /** Черновик переживает перезагрузку и кратковременный обрыв связи. */
  useEffect(() => {
    if (!isSubmitted && !remote) writeCardDraft(sessionId, card.id, fields);
  }, [card.id, fields, isSubmitted, sessionId, remote]);

  const setField = <Key extends keyof IncidentCardFields>(
    key: Key,
    value: IncidentCardFields[Key],
  ) => {
    setFields((current) => ({ ...current, [key]: value }));
    setError(undefined);
    setSaved(false);
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
    setSaved(false);
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
    setSaved(false);
  };

  const toggleService = (
    service: ResponseService,
    name?: string,
    short_name?: string | null,
  ) => {
    if (remote) {
      setFields((current) => {
        const selected = current.manualServices ?? remote.services;
        return {
          ...current,
          manualServices: selected.some((s) => s.id === service)
            ? selected.filter((s) => s.id !== service)
            : [...selected, { id: service, name: name ?? service, short_name }],
        };
      });
    } else {
      setFields((current) => ({
        ...current,
        services: current.services.includes(service)
          ? current.services.filter((s) => s !== service)
          : [...current.services, service],
      }));
    }
    setSaved(false);
    setError(undefined);
  };

  const setCategory = (categoryId: string) => {
    remote?.select(categoryId);
    const category = incidentCategories.find((item) => item.id === categoryId);
    setFields((current) => ({
      ...current,
      categoryId,
      ekpAnswers: {},
      services: remote ? [] : (category?.defaultServices ?? []),
      details: { ...current.details, clarifications: {} },
    }));
    setError(undefined);
    setSaved(false);
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
    setSaved(false);
  };

  const saveDraft = async () => {
    if (!remote || pending || isSubmitted) return;
    setPending(true);
    setError(undefined);
    setSaved(false);
    try {
      await remote.onSave(fields);
      setSavedFields(JSON.stringify(fields));
      setSaved(true);
    } catch (e) {
      setError(getApiError(e).message);
    } finally {
      setPending(false);
    }
  };

  const submit = async () => {
    if (isSubmitted || !isCallAccepted || pending) return;
    if (remote) {
      setPending(true);
      setError(undefined);
      try {
        await onSubmit(fields);
      } catch (e) {
        setError(getApiError(e).message);
      } finally {
        setPending(false);
      }
      return;
    }
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
    setSaved(false);
  };

  const visibleServices = fields.manualServices ?? remote?.services ?? [];
  return {
    fields: remote
      ? { ...fields, services: visibleServices.map((s) => s.id) }
      : fields,
    remote: remote
      ? {
          ...remote,
          services: visibleServices,
          notificationRequired:
            fields.manualServices != null
              ? visibleServices.length > 0
              : remote.notificationRequired,
        }
      : undefined,
    useRecommendedServices: () => setField("manualServices", null),
    pending,
    dirty: JSON.stringify(fields) !== savedFields,
    saved,
    saveDraft,
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

export type {
  IncidentEditor,
  IncidentEditorOptions,
  RemoteEditor,
} from "../types/useIncidentEditor";
