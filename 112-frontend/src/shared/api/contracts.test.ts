import { expect, it } from "vitest";

import { incidentCardsApi } from "@/entities/incident-card";
import { scenariosApi } from "@/entities/scenario";
import { resultsApi, trainingSessionsApi } from "@/entities/training-session";
import { usersApi } from "@/entities/user";
import { analyticsApi } from "@/entities/evaluation/demoEvaluations";

import { apiEndpoints } from "./endpoints";

it("serves every temporary API resource through its fake URL contract", async () => {
  const scenarios = await scenariosApi.list();
  const createdScenario = await scenariosApi.create({
    name: "Контрактный сценарий",
    category: "Проверка API",
    difficulty: "basic",
    durationMinutes: 10,
    normSeconds: 30,
    description: "Создан временным API-контрактом.",
    status: "draft",
  });
  await expect(scenariosApi.getById(scenarios[0].id)).resolves.toEqual(
    scenarios[0],
  );
  await expect(
    scenariosApi.update(createdScenario.id, {
      ...createdScenario,
      name: "Обновлённый сценарий",
    }),
  ).resolves.toMatchObject({ name: "Обновлённый сценарий" });

  const sessions = await trainingSessionsApi.list();
  await expect(trainingSessionsApi.getById(sessions[0].id)).resolves.toEqual(
    sessions[0],
  );
  await expect(
    trainingSessionsApi.start(sessions[0].id),
  ).resolves.toMatchObject({ status: "active" });
  const cards = await incidentCardsApi.list(sessions[0].id);
  await expect(
    incidentCardsApi.update(cards[0].id, cards[0].fields),
  ).resolves.toMatchObject({ id: cards[0].id });
  await expect(
    incidentCardsApi.addAction(cards[0].id, "Проверка контракта"),
  ).resolves.toMatchObject({ action: "Проверка контракта" });
  await expect(incidentCardsApi.submit(cards[0].id)).resolves.toMatchObject({
    card: { id: cards[0].id },
  });
  await expect(
    trainingSessionsApi.complete(sessions[0].id),
  ).resolves.toMatchObject({ status: "completed" });

  await expect(resultsApi.list()).resolves.not.toHaveLength(0);
  await expect(
    resultsApi.getBySessionId("demo-session-3"),
  ).resolves.toMatchObject({ sessionId: "demo-session-3" });
  await expect(usersApi.list()).resolves.not.toHaveLength(0);
  await expect(usersApi.getById("demo-student-1")).resolves.toMatchObject({
    id: "demo-student-1",
  });
  await expect(analyticsApi.getSummary()).resolves.toMatchObject({
    totalSessions: sessions.length,
  });
});

it("keeps resource URL building centralized and URL-safe", () => {
  expect(apiEndpoints.scenarios.detail("id /?")).toBe("scenarios/id%20%2F%3F");
  expect(apiEndpoints.sessions.cards("session /?")).toBe(
    "training-sessions/session%20%2F%3F/incident-cards",
  );
  expect(apiEndpoints.incidentCards.actions("card /?")).toBe(
    "incident-cards/card%20%2F%3F/actions",
  );
});
