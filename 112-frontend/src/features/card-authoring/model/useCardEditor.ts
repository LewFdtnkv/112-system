import { catalogLookupApi } from "@/entities/catalog";
import { formatAddress } from "@/entities/incident-card";
import { cardApi, cardKeys, invalidateCard } from "@/entities/training";
import { matchesFeature, type FeatureValue } from "@/shared/lib/featureValues";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useReducer } from "react";
import { usePhoneInput } from "@/entities/phone";
import type { CardEditorProps } from "../types/CardEditor";
import { cardEditorReducer } from "./cardEditorReducer";
import { cardEditorInitial } from "./cardEditorInitial";
import type { CardEditorState } from "../types/cardEditorState";
import type { LocationPickerProps } from "@/shared/ui/location-picker";
import type { CardEditorForm } from "../types/CardEditorPanels";
import { buildCardTemplateInput } from "../lib/buildCardTemplateInput";

export function useCardEditor({ onClose, initial }: CardEditorProps) {
  const [state, dispatch] = useReducer(
    cardEditorReducer,
    initial,
    cardEditorInitial,
  );
  const {
    ddsExercise,
    location,
    address,
    person,
    victims,
    flags,
    version,
    entry,
    notificationRequired,
    features,
    answers,
    manualRecipients,
    optional,
    form,
  } = state;
  const silent = flags.noContact === true;
  const structuredAddress = formatAddress(address);
  const client = useQueryClient();
  const setForm = (value: Partial<CardEditorForm>) =>
    dispatch({ type: "form", value });
  const phoneRef = useRef<HTMLInputElement>(null);
  const callerPhone = usePhoneInput(form.caller_phone, (caller_phone) =>
    setForm({ caller_phone }),
  );
  const routes = useQuery({
    queryKey: cardKeys.routes(version?.id, entry?.id),
    queryFn: ({ signal }) =>
      catalogLookupApi.routes(version!.id, entry!.id, signal),
    enabled: !!version && !!entry,
  });
  const recipients = (routes.data ?? [])
    .filter(
      (r) =>
        !Object.keys(r.conditions).length ||
        (features.length
          ? Object.entries(
              (r.conditions.when ?? {}) as Record<string, FeatureValue>,
            ).every(([key, v]) => matchesFeature(answers[key], v))
          : optional.includes(r.service_id)),
    )
    .map((r) => r.service_id);
  const save = useMutation({
    mutationFn: () => {
      const body = buildCardTemplateInput({
        initial,
        form,
        version,
        entry,
        silent,
        manualRecipients,
        recipients,
        structuredAddress,
        address,
        victims,
        answers,
        person,
        flags,
        location,
      });
      body.dds_exercise = ddsExercise;
      return initial
        ? cardApi.update(initial.id, {
            ...body,
            revision: initial.revision,
          })
        : cardApi.create(body);
    },
    onSuccess: () => {
      void invalidateCard(client, initial?.id);
      onClose();
    },
  });
  const labels = {
    title: "Название карточки",
    caller_message: "Сообщение заявителя",
    instructions: "Общая инструкция ученику",
    address_text: "Адрес целиком",
    description: "Сообщение в карточке",
    caller_name: "ФИО заявителя",
    caller_phone: "Телефон заявителя",
  };
  return {
    ddsExercise,
    setDDSExercise: (value: CardEditorState["ddsExercise"]) =>
      dispatch({ type: "ddsExercise", value }),
    flags,
    setFlag: (key: string, value: boolean | undefined) =>
      dispatch({ type: "flag", key, value }),
    silent,
    address,
    setAddress: (value: CardEditorState["address"]) =>
      dispatch({ type: "address", value }),
    person,
    setPerson: (value: CardEditorState["person"]) =>
      dispatch({ type: "person", value }),
    victims,
    setVictims: (value: CardEditorState["victims"]) =>
      dispatch({ type: "victims", value }),
    structuredAddress,
    location,
    version,
    setVersion: (value: CardEditorState["version"]) =>
      dispatch({ type: "version", value }),
    entry,
    setEntry: (value: CardEditorState["entry"]) =>
      dispatch({ type: "entry", value }),
    notificationRequired,
    features,
    answers,
    manualRecipients,
    setManualRecipients: (value: CardEditorState["manualRecipients"]) =>
      dispatch({ type: "manualRecipients", value }),
    optional,
    setOptional: (value: CardEditorState["optional"]) =>
      dispatch({ type: "optional", value }),
    form,
    setForm,
    setAnswer: (key: string, value: FeatureValue | undefined) =>
      dispatch({ type: "answer", key, value }),
    confirmLocation: (value: Parameters<LocationPickerProps["onConfirm"]>[0]) =>
      dispatch({ type: "location", value }),
    routes,
    recipients,
    save,
    labels,
    phoneRef,
    callerPhone,
  };
}
