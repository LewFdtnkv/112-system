import type { TokenPair, UserProfile } from "./types";
export const testPair: TokenPair = {
  access_token: "test-access",
  refresh_token: "test-refresh",
  expires_in: 900,
  token_type: "bearer",
  must_change_password: false,
};
export const testProfile: UserProfile = {
  id: "test-student",
  username: "student",
  first_name: "Иван",
  last_name: "Учебный",
  middle_name: null,
  email: null,
  is_active: true,
  is_teacher: false,
  is_admin: false,
  must_change_password: false,
};
export const authFetch: typeof fetch = async (input) => {
  const request = input as Request;
  const path = new URL(request.url).pathname;
  if (path.endsWith("/auth/login")) {
    const body = await request.clone().json();
    return body.password === "valid-password"
      ? Response.json(testPair)
      : Response.json({ detail: "Invalid credentials" }, { status: 401 });
  }
  if (path.endsWith("/users/me")) return Response.json(testProfile);
  if (path.endsWith("/auth/logout")) return new Response(null, { status: 204 });
  return Response.json({ detail: "Unexpected test request" }, { status: 404 });
};
