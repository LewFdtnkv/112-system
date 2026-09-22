export { authApi } from "./api/authApi";
export { useAuthStore } from "./model/authStore";
export {
  demoStudentId,
  demoTeacherId,
  demoUsers,
  userRoleLabels,
} from "./model/demoUsers";
export type { DemoUser, DemoUserRole } from "./model/demoUsers";
export type { AuthSession, AuthState } from "./types/types";

export {
  changePassword,
  refreshSession,
  restoreSession,
  sessionFromProfile,
  signIn,
  signOut,
} from "./model/authSession";
export type { TokenPair, UserProfile } from "./types/types";
