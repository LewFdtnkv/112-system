import type { WorkspaceSnapshot } from "../types/workspaceState";

const workspaceVersion = 1;

export const workspaceStorageKey = (sessionId: string) =>
  `dds112-workspace:v${workspaceVersion}:${sessionId}`;

const isWorkspaceSnapshot = (value: unknown): value is WorkspaceSnapshot => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const snapshot = value as Partial<WorkspaceSnapshot>;

  return (
    Array.isArray(snapshot.incidents) &&
    typeof snapshot.logs === "object" &&
    snapshot.logs !== null &&
    Array.isArray(snapshot.submittedIds) &&
    ["incoming", "accepted", "declined"].includes(snapshot.callState ?? "") &&
    ["connected", "reconnecting"].includes(snapshot.connectionState ?? "") &&
    typeof snapshot.elapsedSeconds === "number" &&
    Number.isInteger(snapshot.elapsedSeconds) &&
    snapshot.elapsedSeconds >= 0
  );
};

export const readWorkspaceSnapshot = (
  sessionId: string,
  fallback: WorkspaceSnapshot,
): WorkspaceSnapshot => {
  try {
    const raw = localStorage.getItem(workspaceStorageKey(sessionId));
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    return isWorkspaceSnapshot(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

export const writeWorkspaceSnapshot = (
  sessionId: string,
  snapshot: WorkspaceSnapshot,
) => {
  try {
    localStorage.setItem(
      workspaceStorageKey(sessionId),
      JSON.stringify(snapshot),
    );
  } catch {
    // Рабочее место остаётся доступным, даже если браузер не даёт писать в хранилище.
  }
};

export const clearWorkspaceSnapshot = (sessionId: string) => {
  try {
    localStorage.removeItem(workspaceStorageKey(sessionId));
  } catch {
    // Вспомогательные данные не должны мешать завершению занятия.
  }
};

export type {
  PersistedCallState,
  PersistedConnectionState,
  WorkspaceSnapshot,
} from "../types/workspaceState";
