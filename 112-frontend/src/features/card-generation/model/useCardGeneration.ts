import {
  cardGenerationOptionsQueryOptions,
  cardKeys,
  generationApi,
  type FeatureDefinition,
  type GenerationParameters,
} from "@/entities/training";
import { randomUUID as createUuid } from "@/shared/lib/uuid";
import { type SelectOption } from "@/shared/ui/ServerSelect";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { CardGenerationDialogProps } from "../types/CardGenerationDialog";
const random: SelectOption = { id: "", label: "Случайно" };
export function useCardGeneration({ onClose }: CardGenerationDialogProps) {
  const client = useQueryClient();
  const [count, setCount] = useState(1);
  const [requestId, setRequestId] = useState(createUuid);
  const [p, setP] = useState<GenerationParameters>({});
  const [version, setVersion] = useState<SelectOption | null>(random);
  const [entry, setEntry] = useState<SelectOption | null>(random);
  const [services, setServices] = useState<SelectOption[]>([]);
  const [serviceChoice, setServiceChoice] = useState<SelectOption | null>(null);
  const [manualServices, setManualServices] = useState(false);
  const [features, setFeatures] = useState<FeatureDefinition[]>([]);
  const options = useQuery(cardGenerationOptionsQueryOptions());
  function change(values: Partial<GenerationParameters>) {
    setP((prev) => {
      const next = { ...prev, ...values };
      if (values.caller_information === "anonymous") {
        next.caller_name = null;
        next.gender = null;
        next.age = null;
      } else if (values.caller_information === "name_only") {
        next.gender = null;
        next.age = null;
      }
      if (values.address_format === "descriptive") {
        next.house = null;
        next.building = null;
        next.structure = null;
      }
      if (values.address_format === "structured")
        next.address_description = null;
      if (values.locality !== undefined && values.street === undefined)
        next.street = null;
      if (
        (values.locality !== undefined || values.street !== undefined) &&
        values.house === undefined
      )
        next.house = null;
      if (
        !next.house ||
        values.house !== undefined ||
        values.street !== undefined ||
        values.locality !== undefined
      ) {
        if (values.building === undefined) next.building = null;
        if (values.structure === undefined) next.structure = null;
      }
      if (
        values.location === undefined &&
        [
          "locality",
          "street",
          "house",
          "building",
          "structure",
          "address_description",
          "address_format",
        ].some((key) => key in values)
      )
        next.location = null;
      return next;
    });
    setRequestId(createUuid());
  }
  const save = useMutation({
    mutationFn: () =>
      generationApi.create(requestId, count, {
        ...p,
        classifier_version_id: version?.id || null,
        classifier_entry_id: entry?.id || null,
        service_ids: manualServices ? services.map((s) => s.id) : null,
      }),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: cardKeys.generations });
      onClose();
    },
  });
  return {
    count,
    setCount,
    setRequestId,
    p,
    version,
    setVersion,
    entry,
    setEntry,
    services,
    setServices,
    serviceChoice,
    setServiceChoice,
    manualServices,
    setManualServices,
    features,
    setFeatures,
    options,
    change,
    save,
  };
}
