export const appConfig = {
  apiUrl: import.meta.env.VITE_API_URL?.trim() || "/api/v1",
} as const;
