import {
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
  const options = useQuery({
    queryKey: ["generation-options"],
    queryFn: ({ signal }) => generationApi.options(signal),
  });
  function change(values: Partial<GenerationParameters>) {
    if (values.no_contact === true) {
      setEntry(random);
      setServices([]);
      setManualServices(false);
      setFeatures([]);
      setP((prev) => ({
        time_of_day: prev.time_of_day,
        detail_level: prev.detail_level,
        call_dropped: prev.call_dropped,
        no_contact: true,
      }));
    } else {
      setP((prev) => ({ ...prev, ...values }));
    }
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
      await client.invalidateQueries({ queryKey: ["card-generations"] });
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
