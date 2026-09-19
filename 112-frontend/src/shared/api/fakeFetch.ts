import { demoIncidents } from "@/entities/incident-card";
import { demoScenarios } from "@/entities/scenario/model/demoScenarios";
import { demoResults, demoSessions } from "@/entities/training-session";
import { demoUsers } from "@/entities/user/model/demoUsers";

const fakePassword = "demo112";
const scenarios = structuredClone(demoScenarios);
const sessions = structuredClone(demoSessions);
const results = structuredClone(demoResults);
const cardsBySession = new Map<string, typeof demoIncidents>([
  ["demo-session-1", structuredClone(demoIncidents)],
]);
const actionLogs = new Map<string, string[]>();

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Content-Type": "application/json" },
  });

const empty = (status = 204) => new Response(null, { status });

const requestBody = async <T>(request: Request) => (await request.json()) as T;

const notFound = () => json({ message: "Resource not found" }, 404);

const cardForId = (cardId: string) => {
  for (const [sessionId, cards] of cardsBySession) {
    const card = cards.find((item) => item.id === cardId);
    if (card) return { sessionId, card };
  }
  return null;
};

export const fakeFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const url = new URL(request.url, "https://api.dds112.test");
  const path = url.pathname.replace(/^\/(?:api\/)?(?:v1\/)?/, "");
  const method = request.method.toUpperCase();

  if (method === "POST" && path === "auth/login") {
    const { email, password } = await requestBody<{
      email: string;
      password: string;
    }>(request);
    const user = demoUsers.find(
      (item) => item.email.toLowerCase() === email.trim().toLowerCase(),
    );
    return user && password === fakePassword
      ? json({ session: { userId: user.id, roles: [user.role] } })
      : json({ message: "Invalid credentials" }, 401);
  }
  if (method === "POST" && path === "auth/logout") return empty();
  if (method === "GET" && path === "auth/me") return json(demoUsers[0]);

  if (method === "GET" && path === "scenarios") return json(scenarios);
  if (method === "POST" && path === "scenarios") {
    const draft = await requestBody<(typeof scenarios)[number]>(request);
    const scenario = { ...draft, id: `scenario-${crypto.randomUUID()}` };
    scenarios.push(scenario);
    return json(scenario, 201);
  }
  if (path.startsWith("scenarios/")) {
    const scenarioId = decodeURIComponent(path.slice("scenarios/".length));
    const index = scenarios.findIndex((item) => item.id === scenarioId);
    if (index === -1) return notFound();
    if (method === "GET") return json(scenarios[index]);
    if (method === "PATCH") {
      scenarios[index] = {
        ...scenarios[index],
        ...(await requestBody<object>(request)),
        id: scenarioId,
      };
      return json(scenarios[index]);
    }
  }

  if (method === "GET" && path === "training-sessions") return json(sessions);
  const sessionMatch = path.match(
    /^training-sessions\/([^/]+)(?:\/(start|complete|incident-cards))?$/,
  );
  if (sessionMatch) {
    const sessionId = decodeURIComponent(sessionMatch[1]);
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return notFound();
    const operation = sessionMatch[2];
    if (!operation && method === "GET") return json(session);
    if (operation === "start" && method === "POST") {
      session.status = "active";
      return json(session);
    }
    if (operation === "complete" && method === "POST") {
      session.status = "completed";
      return json(session);
    }
    if (operation === "incident-cards") {
      const cards = cardsBySession.get(sessionId) ?? [];
      if (method === "GET") return json(cards);
      if (method === "POST") {
        const card = await requestBody<(typeof demoIncidents)[number]>(request);
        cardsBySession.set(sessionId, [card, ...cards]);
        return json(card, 201);
      }
    }
  }

  const cardMatch = path.match(
    /^incident-cards\/([^/]+)(?:\/(actions|submit))?$/,
  );
  if (cardMatch) {
    const cardId = decodeURIComponent(cardMatch[1]);
    const found = cardForId(cardId);
    if (!found) return notFound();
    const operation = cardMatch[2];
    if (!operation && method === "PATCH") {
      Object.assign(found.card, await requestBody<object>(request));
      return json(found.card);
    }
    if (operation === "actions" && method === "POST") {
      const { action } = await requestBody<{ action: string }>(request);
      const log = actionLogs.get(cardId) ?? [];
      log.push(action);
      actionLogs.set(cardId, log);
      return json({ action, log });
    }
    if (operation === "submit" && method === "POST") {
      found.card.fields.status = "closed";
      return json({ card: found.card, log: actionLogs.get(cardId) ?? [] });
    }
  }

  if (method === "GET" && path === "results") return json(results);
  if (method === "GET" && path.startsWith("results/")) {
    const result = results.find(
      (item) => item.sessionId === decodeURIComponent(path.slice(8)),
    );
    return result ? json(result) : notFound();
  }
  if (method === "GET" && path === "users") return json(demoUsers);
  if (method === "GET" && path.startsWith("users/")) {
    const user = demoUsers.find(
      (item) => item.id === decodeURIComponent(path.slice(6)),
    );
    return user ? json(user) : notFound();
  }
  if (method === "GET" && path === "analytics/summary") {
    const averageScore = results.length
      ? Math.round(
          results.reduce(
            (sum, result) =>
              sum +
              result.criteria.reduce((score, item) => score + item.score, 0),
            0,
          ) / results.length,
        )
      : null;
    return json({
      totalSessions: sessions.length,
      completedSessions: sessions.filter((item) => item.status === "completed")
        .length,
      activeSessions: sessions.filter((item) => item.status === "active")
        .length,
      averageScore,
    });
  }

  return notFound();
};
