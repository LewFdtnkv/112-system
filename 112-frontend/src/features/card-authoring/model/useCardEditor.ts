import {
  cardFlagFields,
  emptyIncidentAddress,
  formatAddress,
} from "@/entities/incident-card";
import {
  trainingApi,
  type CardTemplateInput,
  type FeatureDefinition,
} from "@/entities/training";
import { matchesFeature, type FeatureValue } from "@/shared/lib/featureValues";
import { type SelectOption } from "@/shared/ui/ServerSelect";
import type { MapPoint } from "@/shared/lib/geo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { usePhoneInput } from "@/entities/phone";
import type { CardEditorProps } from "../types/CardEditor";

const mapPoint = (value: unknown): MapPoint | null => {
  if (
    !value ||
    typeof value !== "object" ||
    !Number.isFinite((value as MapPoint).latitude) ||
    !Number.isFinite((value as MapPoint).longitude)
  )
    return null;
  return value as MapPoint;
};

export function useCardEditor({ onClose, initial }: CardEditorProps) {
  const [location, setLocation] = useState<MapPoint | null>(() =>
    mapPoint(initial?.data.additional_fields?.location),
  );
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
  const [victims, updateVictims] = useState(
    String(initial?.data.features?.victimsCount ?? ""),
  );
  const [flags, setFlags] = useState<Record<string, boolean | undefined>>(
    () => {
      const details = initial?.data.additional_fields?.details as
        Record<string, unknown> | undefined;
      return Object.fromEntries(
        cardFlagFields.map(({ key }) => [
          key,
          typeof details?.[key] === "boolean"
            ? details[key]
            : initial
              ? undefined
              : false,
        ]),
      );
    },
  );
  const setVictims = (value: string) => {
    updateVictims(value);
    if (value !== "")
      setFlags((current) => ({ ...current, hasVictims: Number(value) > 0 }));
  };
  const setFlag = (key: string, value: boolean | undefined) => {
    setFlags((current) => ({
      ...current,
      [key]: value,
      ...(key === "noContact" && value
        ? {
            hasVictims: undefined,
            refusedAmbulance: undefined,
            blocked: undefined,
          }
        : {}),
    }));
    if (key === "noContact" && value) updateVictims("");
    if (
      key === "hasVictims" &&
      value != null &&
      victims !== "" &&
      Number(victims) > 0 !== value
    )
      updateVictims("");
  };
  const silent = flags.noContact === true;
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
          id: initial.classifier_entry.id,
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
        classifier_entry_id: silent ? null : entry!.id,
        recipient_service_ids: silent
          ? []
          : (manualRecipients?.map((s) => s.id) ?? recipients),
        use_recommended_recipients: manualRecipients === null,
        data: {
          ...initial?.data,
          address_text: silent ? "" : structuredAddress || form.address_text,
          address_details: silent
            ? null
            : Object.fromEntries(
                Object.entries(address).filter(([, value]) => value?.trim()),
              ),
          features: {
            ...initial?.data.features,
            victimsCount: silent || victims === "" ? null : Number(victims),
            ekp: silent ? {} : answers,
          },
          description: form.description,
          caller_details: silent
            ? null
            : {
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
          caller_name: silent ? null : form.caller_name,
          caller_phone:
            form.caller_phone.trim() === "+" ? "" : form.caller_phone,
          additional_fields: {
            ...initial?.data.additional_fields,
            location: silent ? null : location,
            details: {
              ...((initial?.data.additional_fields?.details as Record<
                string,
                unknown
              >) ?? {}),
              ...flags,
              ...(silent
                ? { callerGender: null, callerAge: null, callerStatus: null }
                : {}),
            },
          },
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
    flags,
    setFlag,
    silent,
    address,
    setAddress,
    person,
    setPerson,
    victims,
    setVictims,
    structuredAddress,
    location,
    setLocation,
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
