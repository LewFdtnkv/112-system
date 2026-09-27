import { createStore } from "zustand/vanilla";
import { createJSONStorage, persist } from "zustand/middleware";
import type { LocalDraft, LocalDraftState } from "../types/localDraft";
import { randomUUID } from "./uuid";

/** One key per owner/attempt: clearing one draft never removes another user's work. */
export const localDraftKey = (userId: string, attemptId: string) =>
  `system112-draft-v1:${encodeURIComponent(userId)}:${encodeURIComponent(attemptId)}`;

export function createLocalDraftStore<T>(
  key: string,
  validate: (value: unknown) => value is T,
) {
  let lastStored: string | null = null;
  const failed = () =>
    queueMicrotask(() => {
      if (!store.getState().storageFailed)
        store.setState({ storageFailed: true });
    });
  const store = createStore<LocalDraftState<T>>()(
    persist(
      (set) => ({
        draft: null,
        storageFailed: false,
        save: (fields, revision) =>
          set({
            draft: {
              fields,
              revision,
              token: randomUUID(),
              updatedAt: Date.now(),
            },
          }),
        // A reply to an older save must retain edits entered while it was in flight.
        acknowledge: (token, revision) =>
          set((state) => ({
            draft:
              !state.draft || state.draft.token === token
                ? null
                : { ...state.draft, revision },
          })),
        clear: () => set({ draft: null }),
      }),
      {
        name: key,
        version: 1,
        storage: createJSONStorage(() => ({
          getItem: (name) => {
            try {
              lastStored = localStorage.getItem(name);
              return lastStored;
            } catch {
              failed();
              return null;
            }
          },
          setItem: (name, value) => {
            try {
              // Another tab may have its own unsent edits. Never erase them on acknowledgment.
              if (localStorage.getItem(name) !== lastStored) {
                failed();
                return;
              }
              localStorage.setItem(name, value);
              lastStored = value;
            } catch {
              failed();
            }
          },
          removeItem: (name) => {
            try {
              localStorage.removeItem(name);
            } catch {
              failed();
            }
          },
        })),
        partialize: ({ draft }) => ({ draft }),
        merge: (persisted, current) => {
          const candidate = (
            persisted as { draft?: LocalDraft<unknown> } | null
          )?.draft;
          if (!candidate) return current;
          if (
            !Number.isInteger(candidate.revision) ||
            candidate.revision < 1 ||
            typeof candidate.token !== "string" ||
            !Number.isFinite(candidate.updatedAt) ||
            !validate(candidate.fields)
          ) {
            failed();
            return current;
          }
          return {
            ...current,
            draft: { ...candidate, fields: candidate.fields },
          };
        },
        onRehydrateStorage: () => (_state, error) => {
          if (error) failed();
        },
      },
    ),
  );
  return store;
}
