const encode = (value: string) => encodeURIComponent(value);

export const apiEndpoints = {
  auth: {
    login: "auth/login",
    logout: "auth/logout",
    me: "auth/me",
  },
  scenarios: {
    list: "scenarios",
    detail: (scenarioId: string) => `scenarios/${encode(scenarioId)}`,
  },
  sessions: {
    list: "training-sessions",
    detail: (sessionId: string) => `training-sessions/${encode(sessionId)}`,
    start: (sessionId: string) =>
      `training-sessions/${encode(sessionId)}/start`,
    complete: (sessionId: string) =>
      `training-sessions/${encode(sessionId)}/complete`,
    cards: (sessionId: string) =>
      `training-sessions/${encode(sessionId)}/incident-cards`,
  },
  incidentCards: {
    detail: (cardId: string) => `incident-cards/${encode(cardId)}`,
    actions: (cardId: string) => `incident-cards/${encode(cardId)}/actions`,
    submit: (cardId: string) => `incident-cards/${encode(cardId)}/submit`,
  },
  results: {
    list: "results",
    detail: (sessionId: string) => `results/${encode(sessionId)}`,
  },
  users: {
    list: "users",
    detail: (userId: string) => `users/${encode(userId)}`,
  },
  analytics: { summary: "analytics/summary" },
} as const;
