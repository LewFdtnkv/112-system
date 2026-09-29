import { incidentIssues, IncidentValidationError } from "../lib/validation";
import { cardData } from "./cardAdapter";
import type {
  IncidentAddress,
  IncidentCardDetails,
  IncidentCardFields,
  IncidentPhones,
  ResponseService,
} from "@/entities/incident-card";
import { getApiError, getApiFieldErrors } from "@/shared/api";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import type {
  IncidentEditorOptions,
  EditorCommand,
} from "../types/useIncidentEditor";

export function useIncidentEditor({
  card,
  remote,
  isSubmitted,
  isCallAccepted,
  onSubmit,
}: IncidentEditorOptions) {
  const [fields, setFields] = useState(card.fields);
  const command = useMutation({
    mutationFn: async ({ kind, fields: submitted }: EditorCommand) => {
      if (kind === "save") await remote.onSave(submitted);
      else {
        const issues = incidentIssues(submitted, remote);
        if (issues.length) throw new IncidentValidationError(issues);
        await onSubmit(submitted);
      }
      return submitted;
    },
  });
  const fieldIssues = useMemo(() => {
    if (command.error instanceof IncidentValidationError) {
      const previous = command.error.issues;
      return incidentIssues(fields, remote).filter((issue) =>
        previous.some((old) => old.path === issue.path),
      );
    }
    const errors = getApiFieldErrors(command.error);
    if (!command.variables) return [];
    const original = {
      data: cardData(command.variables.fields, { additional_fields: {} }),
      classifier_entry_id: command.variables.fields.categoryId,
    };
    const current = {
      data: cardData(fields, { additional_fields: {} }),
      classifier_entry_id: fields.categoryId,
    };
    const at = (obj: unknown, path: string): unknown =>
      path
        .split(".")
        .reduce<unknown>(
          (value, key) =>
            value && typeof value === "object"
              ? (value as Record<string, unknown>)[key]
              : undefined,
          obj,
        );
    return errors.filter(
      (issue) =>
        JSON.stringify(at(original, issue.path)) ===
        JSON.stringify(at(current, issue.path)),
    );
  }, [command.error, command.variables, fields, remote]);
  const dirty =
    JSON.stringify(fields) !== JSON.stringify(command.data ?? card.fields);
  const onFieldsChange = remote.onFieldsChange;
  useEffect(() => {
    if (!isSubmitted) onFieldsChange?.(fields);
  }, [fields, isSubmitted, onFieldsChange]);

  const setField = <Key extends keyof IncidentCardFields>(
    key: Key,
    value: IncidentCardFields[Key],
  ) => setFields((current) => ({ ...current, [key]: value }));
  const setAddressField = <Key extends keyof IncidentAddress>(
    key: Key,
    value: IncidentAddress[Key],
  ) =>
    setFields((current) => ({
      ...current,
      address: { ...current.address, [key]: value },
    }));
  const setPhoneField = <Key extends keyof IncidentPhones>(
    key: Key,
    value: IncidentPhones[Key],
  ) =>
    setFields((current) => ({
      ...current,
      phones: { ...current.phones, [key]: value },
    }));
  const setDetail = <Key extends keyof IncidentCardDetails>(
    key: Key,
    value: IncidentCardDetails[Key],
  ) =>
    setFields((current) => ({
      ...current,
      details: { ...current.details, [key]: value },
    }));
  const visibleServices = fields.manualServices ?? remote.services;
  const toggleService = (
    service: ResponseService,
    name?: string,
    short_name?: string | null,
  ) =>
    setField(
      "manualServices",
      visibleServices.some((s) => s.id === service)
        ? visibleServices.filter((s) => s.id !== service)
        : [
            ...visibleServices,
            { id: service, name: name ?? service, short_name },
          ],
    );
  const setCategory = (categoryId: string) => {
    remote.select(categoryId);
    setFields((current) => ({
      ...current,
      categoryId,
      ekpAnswers: {},
      services: [],
      details: { ...current.details, clarifications: {} },
    }));
  };
  const run = (kind: EditorCommand["kind"]) => {
    if (
      !isSubmitted &&
      !command.isPending &&
      (kind === "save" || isCallAccepted)
    )
      command.mutate({ kind, fields });
  };
  return {
    fields: { ...fields, services: visibleServices.map((s) => s.id) },
    remote: {
      ...remote,
      services: visibleServices,
      notificationRequired: fields.details?.noContact
        ? false
        : fields.manualServices != null
          ? visibleServices.length > 0
          : remote.notificationRequired,
    },
    useRecommendedServices: () => setField("manualServices", null),
    setVictims: (present: boolean) =>
      setFields((current) => ({
        ...current,
        victimsCount: null,
        details: { ...current.details, hasVictims: present },
      })),
    pending: command.isPending,
    dirty,
    saved: command.isSuccess && command.variables.kind === "save" && !dirty,
    fieldIssues,
    validationAttempt: command.error,
    error:
      command.error instanceof IncidentValidationError
        ? undefined
        : command.error && !getApiFieldErrors(command.error).length
          ? getApiError(command.error).message
          : undefined,
    saveDraft: () => run("save"),
    submit: () => run("submit"),
    setField,
    setAddressField,
    setPhoneField,
    setDetail,
    toggleService,
    setCategory,
  };
}

export type {
  IncidentEditor,
  IncidentEditorOptions,
  RemoteEditor,
} from "../types/useIncidentEditor";
