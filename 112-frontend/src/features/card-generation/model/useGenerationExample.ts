import { cardApi, cardKeys, type CardTemplate } from "@/entities/training";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useGenerationExample(card: CardTemplate) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      cardApi.setGenerationExample(card.id, card.revision, enabled),
    onSuccess: (updated) =>
      client.setQueryData(cardKeys.detail(card.id), updated),
    onError: () =>
      void client.invalidateQueries({ queryKey: cardKeys.detail(card.id) }),
  });
}
