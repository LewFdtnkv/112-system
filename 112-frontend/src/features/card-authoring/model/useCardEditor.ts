import { emptyIncidentAddress, formatAddress } from "@/entities/incident-card";
import {
  trainingApi,
  type CardTemplateInput,
  type FeatureDefinition,
} from "@/entities/training";
import { matchesFeature, type FeatureValue } from "@/shared/lib/featureValues";
import { type SelectOption } from "@/shared/ui/ServerSelect";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { usePhoneInput } from "@/entities/phone";
import type { CardEditorProps } from "../types/CardEditor";

export function useCardEditor({ onClose, initial }: CardEditorProps) {
  const [address, setAddress] = useState({
    ...emptyIncidentAddress,
    ...Object.fromEntries(
      Object.entries(initial?.data.address_details ?? {}).filter(
        ([, v]) => typeof v === "string",
      ),
    ),
  });
  const [person, setPerson] = useState({
    gender: String(initial?.data.caller_details?.gender ?? ""),
    age: String(initial?.data.caller_details?.age ?? ""),
    height_cm: String(initial?.data.caller_details?.height_cm ?? ""),
    weight_kg: String(initial?.data.caller_details?.weight_kg ?? ""),
    appearance: String(initial?.data.caller_details?.appearance ?? ""),
  });
  const [victims, setVictims] = useState(
    String(initial?.data.features?.victimsCount ?? ""),
  );
  const structuredAddress = formatAddress(address);
  const client = useQueryClient();
  const [version, setVersion] = useState<SelectOption | null>(
    initial
      ? { id: initial.classifier_version_id, label: initial.classifier_label }
      : null,
  );
  const [entry, setEntry] = useState<SelectOption | null>(
    initial?.classifier_entry
      ? {
          id: initial.classifier_entry_id,
          label: `${initial.classifier_entry.code} — ${initial.classifier_entry.name}`,
        }
      : null,
  );
  const [notificationRequired, setNotificationRequired] = useState(
    initial?.classifier_entry?.notification_required !== false,
  );
  const [features, setFeatures] = useState<FeatureDefinition[]>(
    (initial?.classifier_entry?.conditions.features ??
      []) as FeatureDefinition[],
  );
  const [answers, setAnswers] = useState<Record<string, FeatureValue>>(
    (initial?.data.features?.ekp ?? {}) as Record<string, FeatureValue>,
  );
  const [manualRecipients, setManualRecipients] = useState<
    SelectOption[] | null
  >(
    initial
      ? (initial.recipients ?? []).map((s) => ({
          id: s.service_id,
          label: s.name,
        }))
      : null,
  );
  const [optional, setOptional] = useState<string[]>([]);
  const [form, setForm] = useState({
    title: initial?.title ?? "",
    caller_message: initial?.caller_message ?? "",
    instructions: initial?.instructions ?? "",
    address_text: initial?.data.address_text ?? "",
    description: initial?.data.description ?? "",
    caller_name: initial?.data.caller_name ?? "",
    caller_phone: initial?.data.caller_phone ?? "",
  });
  const phoneRef = useRef<HTMLInputElement>(null);
  const callerPhone = usePhoneInput(form.caller_phone, (caller_phone) =>
    setForm((current) => ({ ...current, caller_phone })),
  );
  const routes = useQuery({
    queryKey: ["routes", version?.id, entry?.id],
    queryFn: ({ signal }) => trainingApi.routes(version!.id, entry!.id, signal),
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
      const body: CardTemplateInput = {
        title: form.title,
        caller_message: form.caller_message.trim() ? form.caller_message : null,
        instructions: form.instructions,
        classifier_version_id: version!.id,
        classifier_entry_id: entry!.id,
        recipient_service_ids: manualRecipients?.map((s) => s.id) ?? recipients,
        use_recommended_recipients: manualRecipients === null,
        data: {
          ...initial?.data,
          address_text: structuredAddress || form.address_text,
          address_details: Object.fromEntries(
            Object.entries(address).filter(([, value]) => value?.trim()),
          ),
          features: {
            ...initial?.data.features,
            victimsCount: victims === "" ? null : Number(victims),
            ekp: answers,
          },
          description: form.description,
          caller_details: {
            ...initial?.data.caller_details,
            ...Object.fromEntries(
              Object.entries(person).map(([k, v]) => [
                k,
                v === ""
                  ? null
                  : ["age", "height_cm", "weight_kg"].includes(k)
                    ? Number(v)
                    : v,
              ]),
            ),
          },
          caller_name: form.caller_name,
          caller_phone: form.caller_phone.trim() === "+" ? "" : form.caller_phone,
          additional_fields: initial?.data.additional_fields ?? {},
        },
      };
      return initial
        ? trainingApi.updateCard(initial.id, {
            ...body,
            revision: initial.revision,
          })
        : trainingApi.createCard(body);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["cards"] });
      void client.invalidateQueries({ queryKey: ["card", initial?.id] });
      void client.invalidateQueries({ queryKey: ["card-options"] });
      onClose();
    },
  });
  const labels = {
    title: "Название карточки",
    caller_message: "Сообщение заявителя для ученика",
    instructions: "Инструкция ученику",
    address_text: "Адрес целиком",
    description: "Сообщение в карточке",
    caller_name: "ФИО заявителя",
    caller_phone: "Телефон заявителя",
  };
  return {
    address,
    setAddress,
    person,
    setPerson,
    victims,
    setVictims,
    structuredAddress,
    version,
    setVersion,
    entry,
    setEntry,
    notificationRequired,
    setNotificationRequired,
    features,
    setFeatures,
    answers,
    setAnswers,
    manualRecipients,
    setManualRecipients,
    optional,
    setOptional,
    form,
    setForm,
    routes,
    recipients,
    save,
    labels,
    phoneRef,
    callerPhone,
  };
}
