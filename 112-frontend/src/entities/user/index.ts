export { authStorageKey, useAuthStore } from "./model/authStore";
export { authApi } from "./api/authApi";
export { usersApi } from "./api/usersApi";
export type { AuthSession, AuthState } from "./model/types";
export {
  demoUsers,
  demoStudentId,
  demoTeacherId,
  userRoleLabels,
} from "./model/demoUsers";
export type { DemoUser, DemoUserRole } from "./model/demoUsers";

export type { TokenPair, UserProfile } from "./model/types";
export {
  signIn,
  signOut,
  changePassword,
  restoreSession,
  refreshSession,
  sessionFromProfile,
} from "./model/authSession";
