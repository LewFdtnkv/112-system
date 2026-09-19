import { expect, it } from "vitest";

import { demoPassword, signInWithDemoCredentials } from "./demoAuth";

it("creates a role-aware session through the temporary API", async () => {
  await expect(
    signInWithDemoCredentials("student1@example.test", demoPassword),
  ).resolves.toEqual({
    success: true,
    session: { userId: "demo-student-1", roles: ["student"] },
  });
});

it.each([
  ["missing@example.test", demoPassword],
  ["student1@example.test", "wrong-password"],
])(
  "does not authenticate invalid demonstration credentials",
  async (email, password) => {
    await expect(signInWithDemoCredentials(email, password)).resolves.toEqual({
      success: false,
      message: "Проверьте электронную почту и пароль.",
    });
  },
);
