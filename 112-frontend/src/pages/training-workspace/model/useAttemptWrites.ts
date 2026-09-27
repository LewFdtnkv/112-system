import type { IncidentCardFields } from "@/entities/incident-card";
import {
  attemptApi,
  useAttemptSnapshot,
  type Attempt,
} from "@/entities/training";
import { cardData } from "@/features/incident-editing";
import { useMutation } from "@tanstack/react-query";

/** All writes to one attempt run sequentially; revision is read at execution time. */
export function useAttemptWrites(
  initial: Attempt,
  expectedRevision?: () => number,
) {
  const snapshot = useAttemptSnapshot(initial);
  const scope = { id: `attempt:${initial.id}` };
  const draft = useMutation({
    mutationKey: ["save-attempt", initial.id],
    scope,
    retry: false,
    onMutate: snapshot.cancelRead,
    mutationFn: (fields: IncidentCardFields) => {
      const current = snapshot.latest();
      if (current.status !== "in_progress")
        throw new Error("Карточка уже завершена.");
      return attemptApi.saveDraft(
        current.id,
        expectedRevision?.() ?? current.card.revision,
        fields.categoryId || null,
        cardData(fields, current.card.data),
        fields.manualServices?.map((s) => s.id) ?? null,
      );
    },
    onSuccess: snapshot.update,
  });
  const submit = useMutation({
    mutationKey: ["submit-attempt", initial.id],
    scope,
    retry: false,
    onMutate: snapshot.cancelRead,
    mutationFn: () => {
      const current = snapshot.latest();
      return attemptApi.submit(current.id, current.card.revision);
    },
    onSuccess: snapshot.update,
  });
  return { attempt: snapshot.data, draft, submit };
}
