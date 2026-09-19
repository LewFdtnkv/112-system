import { test as base, expect } from "@playwright/test";
export const test = base.extend({
  page: async ({ page }, providePage) => {
    let username = "student1";
    await page.route("**/api/v1/auth/login", async (route) => {
      const body = route.request().postDataJSON();
      username = body.username;
      await route.fulfill({
        json: {
          access_token: `test-${username}`,
          refresh_token: `refresh-${username}`,
          token_type: "bearer",
          expires_in: 900,
          must_change_password: false,
        },
      });
    });
    await page.route("**/api/v1/users/me", async (route) => {
      // Derive from the bearer token so a full page reload is also verified.
      const teacher = route
        .request()
        .headers()
        .authorization?.includes("teacher");
      await route.fulfill({
        json: {
          id: teacher ? "demo-teacher-1" : "demo-student-1",
          username: teacher ? "teacher" : "student1",
          first_name: teacher ? "Учебный преподаватель" : "Анна",
          last_name: teacher ? "" : "Смирнова",
          middle_name: null,
          email: null,
          is_active: true,
          is_teacher: !!teacher,
          is_admin: false,
          must_change_password: false,
        },
      });
    });
    await page.route("**/api/v1/auth/logout", (route) =>
      route.fulfill({ status: 204 }),
    );
    await providePage(page);
  },
});
export { expect };
