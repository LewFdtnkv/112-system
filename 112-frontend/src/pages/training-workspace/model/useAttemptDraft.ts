import type { IncidentCardFields } from "@/entities/incident-card";
import { attemptApi, trainingKeys, type Attempt } from "@/entities/training";
import { useAuthStore } from "@/entities/user";
import { attemptCard } from "@/features/incident-editing";
import { getApiError } from "@/shared/api";
import { createLocalDraftStore, localDraftKey } from "@/shared/lib/localDraft";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import { useAttemptWrites } from "./useAttemptWrites";
import { validDraftFields } from "./validDraftFields";

export function useAttemptDraft(
  initial: Attempt,
  onReset: (value: Attempt) => void,
) {
  const userId = useAuthStore((s) => s.session?.userId) ?? "";
  const [store] = useState(() =>
    createLocalDraftStore(localDraftKey(userId, initial.id), validDraftFields),
  );
  const local = useStore(store);
  const [restored] = useState(() =>
    initial.status === "in_progress" ? local.draft : null,
  );
  const [initialFields] = useState(
    () => restored?.fields ?? attemptCard(initial).fields,
  );
  const observed = useRef(JSON.stringify(initialFields));
  const revision = useRef(restored?.revision ?? initial.card.revision);
  const blocked = useRef(
    !!restored && restored.revision !== initial.card.revision,
  );
  const [conflict, setConflict] = useState(
    !!restored && restored.revision !== initial.card.revision,
  );
  const flight = useRef<Promise<void> | null>(null);
  const retryAt = useRef(0);
  const writes = useAttemptWrites(initial, () => revision.current);
  const client = useQueryClient();
  const active = useRef(true);
  const flush = async () => {
    if (writes.attempt.status !== "in_progress") return;
    if (blocked.current) throw new Error("Сначала выберите версию карточки.");
    if (flight.current) return flight.current;
    const drain = async () => {
      while (active.current && store.getState().draft) {
        if (!userId || useAuthStore.getState().session?.userId !== userId)
          throw new Error("Сеанс пользователя изменился.");
        const draft = store.getState().draft!;
        try {
          const result = await writes.draft.mutateAsync(draft.fields);
          revision.current = result.card.revision;
          store.getState().acknowledge(draft.token, revision.current);
          retryAt.current = 0;
        } catch (error) {
          const info = getApiError(error);
          if (info.kind === "http" && info.status === 409) {
            blocked.current = true;
            setConflict(true);
          }
          // Validation/auth failures need user action; outages are retried without another keystroke.
          retryAt.current =
            info.kind === "http" &&
            (info.status ?? 0) < 500 &&
            info.status !== 429
              ? Infinity
              : Date.now() + 5000;
          throw error;
        }
      }
    };
    flight.current = drain().finally(() => {
      flight.current = null;
    });
    return flight.current;
  };
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => {
    active.current = true;
    const tick = () => {
      if (
        !blocked.current &&
        Date.now() >= retryAt.current &&
        store.getState().draft
      )
        void flushRef.current().catch(() => undefined);
    };
    const online = () => {
      if (retryAt.current !== Infinity) {
        retryAt.current = 0;
        tick();
      }
    };
    const timer = setInterval(tick, 1000);
    window.addEventListener("online", online);
    return () => {
      active.current = false;
      clearInterval(timer);
      window.removeEventListener("online", online);
    };
  }, [store]);
  useEffect(() => {
    if (writes.attempt.status !== "in_progress") {
      blocked.current = true;
      store.getState().clear();
    }
  }, [writes.attempt.status, store]);
  const observe = (fields: IncidentCardFields) => {
    const serialized = JSON.stringify(fields);
    if (
      writes.attempt.status !== "in_progress" ||
      serialized === observed.current
    )
      return;
    observed.current = serialized;
    store.getState().save(fields, revision.current);
    retryAt.current = 0;
  };
  const resolve = useMutation({
    mutationFn: async (keepLocal: boolean) => {
      const fresh = await attemptApi.get(initial.id);
      client.setQueryData(trainingKeys.attempt(fresh.id), fresh);
      if (
        keepLocal &&
        fresh.status === "in_progress" &&
        store.getState().draft
      ) {
        revision.current = fresh.card.revision;
        store.getState().save(store.getState().draft!.fields, revision.current);
        blocked.current = false;
        setConflict(false);
        retryAt.current = 0;
      } else {
        store.getState().clear();
        onReset(fresh);
      }
    },
  });
  const errorInfo = getApiError(writes.draft.error);
  return {
    ...writes,
    initialFields,
    observe,
    flush,
    save: async (fields: IncidentCardFields) => {
      observe(fields);
      // Explicit save/submit still validates unchanged fields on the server.
      if (!store.getState().draft && writes.attempt.status === "in_progress")
        store.getState().save(fields, revision.current);
      await flush();
    },
    localPending: !!local.draft,
    storageFailed: local.storageFailed,
    restored: !!restored,
    conflict,
    retryable:
      errorInfo.kind !== "http" ||
      errorInfo.status >= 500 ||
      errorInfo.status === 429,
    resolve,
  };
}
