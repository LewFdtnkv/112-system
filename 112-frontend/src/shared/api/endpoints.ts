export const apiEndpoints = {
  auth: {
    login: "auth/login",
    logout: "auth/logout",
    me: "users/me",
    refresh: "auth/refresh",
    changePassword: "auth/change-password",
  },
} as const;
