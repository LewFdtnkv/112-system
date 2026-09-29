export interface LocalDraft<T> {
  fields: T;
  revision: number;
  token: string;
  updatedAt: number;
}

export interface LocalDraftState<T> {
  draft: LocalDraft<T> | null;
  storageFailed: boolean;
  save: (fields: T, revision: number) => void;
  acknowledge: (token: string, revision: number) => void;
  clear: () => void;
}
