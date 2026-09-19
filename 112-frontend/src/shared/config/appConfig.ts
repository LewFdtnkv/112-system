export const appConfig = {
  apiUrl: import.meta.env.VITE_API_URL?.trim() || "/api/v1",
  useFakeApi: import.meta.env.VITE_USE_FAKE_API !== "false",
  geocodingUrl:
    import.meta.env.VITE_GEOCODING_URL?.trim() ||
    "https://nominatim.openstreetmap.org/search",
} as const;
