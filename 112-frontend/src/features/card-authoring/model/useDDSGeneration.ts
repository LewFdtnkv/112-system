import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cardKeys,
  invalidateCard,
  ddsGenerationApi,
  type CardTemplate,
  type DDSGenerationInput,
} from "@/entities/training";
import { randomUUID } from "@/shared/lib/uuid";
import type { SelectOption } from "@/shared/ui/ServerSelect";
import { useDDSProfile } from "./useDDSProfile";

export function useDDSGeneration(card: CardTemplate) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState<SelectOption | null>(null);
  const [parameters, setParameters] = useState<DDSGenerationInput>({
    request_id: randomUUID(),
    revision: card.revision,
    service_profile_id: "",
    crew_codes: null,
    initial_status: null,
    target_status: null,
    crew_calls_required: false,
    replace_existing: false,
  });
  const directory = useDDSProfile(profile?.id);
  const jobs = useQuery({
    queryKey: cardKeys.ddsGenerations(card.id),
    queryFn: ({ signal }) => ddsGenerationApi.jobs(card.id, signal),
    refetchInterval: (query) =>
      query.state.data?.some((j) => ["queued", "running"].includes(j.status))
        ? 3000
        : false,
  });
  const latest = jobs.data?.[0];
  useEffect(() => {
    if (latest?.status === "succeeded") void invalidateCard(client, card.id);
  }, [latest?.id, latest?.status, client, card.id]);
  function change(values: Partial<DDSGenerationInput>) {
    setParameters((p) => ({ ...p, ...values, request_id: randomUUID() }));
  }
  const save = useMutation({
    mutationFn: () =>
      ddsGenerationApi.create(card.id, {
        ...parameters,
        service_profile_id: profile?.id ?? "",
        revision: card.revision,
      }),
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({
          queryKey: cardKeys.ddsGenerations(card.id),
        }),
        client.invalidateQueries({ queryKey: cardKeys.generations }),
      ]);
      setOpen(false);
    },
  });
  return {
    open,
    setOpen,
    profile,
    setProfile,
    parameters,
    directory,
    change,
    save,
    jobs,
    latest,
    pending: jobs.data?.some(
      (j) => j.status === "queued" || j.status === "running",
    ),
  };
}
