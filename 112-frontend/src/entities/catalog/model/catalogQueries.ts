import type { QueryClient } from "@tanstack/react-query";

export const catalogKeys = {
  profile: (id?: string) => ["profile", id] as const,
  profiles: ["profiles"] as const,
  adminProfiles: ["admin-profiles"] as const,
  adminProfileList: (serviceId: string | undefined, page: number) =>
    ["admin-profiles", serviceId, page] as const,
  adminProfile: (id?: string) => ["admin-profile", id] as const,
};

export function invalidateProfiles(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: catalogKeys.adminProfiles }),
    client.invalidateQueries({ queryKey: ["admin-profile"] }),
    client.invalidateQueries({ queryKey: catalogKeys.profiles }),
  ]);
}
