import { api, apiEndpoints } from "@/shared/api";

import type { DemoUser } from "../model/demoUsers";

export const usersApi = {
  list: () => api.get(apiEndpoints.users.list).json<DemoUser[]>(),
  getById: (userId: string) =>
    api.get(apiEndpoints.users.detail(userId)).json<DemoUser>(),
};
