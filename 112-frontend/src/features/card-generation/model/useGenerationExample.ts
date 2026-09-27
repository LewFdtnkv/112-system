import { cardApi, cardKeys, type CardTemplate } from "@/entities/training";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export function useGenerationExample(card: CardTemplate) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      cardApi.setGenerationExample(card.id, card.revision, enabled),
    onSuccess: (updated) => {
      client.setQueryData(cardKeys.detail(card.id), updated);
      void client.invalidateQueries({ queryKey: ["generation-memory"] });
      void client.invalidateQueries({ queryKey: cardKeys.all });
    },
    onError: () =>
      void client.invalidateQueries({ queryKey: cardKeys.detail(card.id) }),
  });
}
