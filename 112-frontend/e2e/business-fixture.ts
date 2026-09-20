import type { Page } from "@playwright/test";
export async function mockBusiness(page: Page) {
  let attempt = {
    id: "attempt",
    assignment_id: "assignment",
    status: "in_progress",
    started_at: new Date().toISOString(),
    ended_at: null as string | null,
    instructions: "Заполните карточку по сообщению",
    caller_message: "На Учебной улице, 7, дым из окна.",
    time_limit_seconds: null,
    norm_seconds: 60,
    card: {
      id: "card",
      revision: 1,
      classifier_version_id: "version",
      classifier_entry_id: "entry",
      status: "draft",
      data: {
        caller_name: "Иван Петров",
        caller_phone: "+7 900 000-00-01",
        address_text: "Учебная улица, д. 7",
        address_details: { street: "Учебная улица", house: "7" },
        description: "Дым из окна",
        additional_fields: {},
      },
      opened_at: null,
      saved_at: null,
    },
    classifier_entry: {
      id: "entry",
      classifier_version_id: "version",
      code: "T001",
      name: "Учебный пожар",
      section: "Учебный",
      conditions: {},
    },
    notified_services: [] as { service_id: string; name: string }[],
    recipient_services: [
      { service_id: "service", name: "Учебная пожарная служба" },
    ],
    recipient_error: null,
  };
  await page.route("**/api/v1/**", async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname.replace("/api/v1/", "");
    if (path.startsWith("auth/") || path === "users/me")
      return route.fallback();
    if (path === "student/messages")
      return route.fulfill({
        json: { items: [], total: 0, limit: 20, offset: 0 },
      });
    if (path.endsWith("/photo")) return route.fulfill({ status: 204 });
    if (path.endsWith("/proctoring"))
      return route.fulfill({ json: { accepted: 1 } });
    const completed = attempt.status === "completed";
    const row = {
      lesson_id: "lesson",
      title: "Учебное занятие",
      student_id: "demo-student-1",
      student_name: "Анна Смирнова",
      scenario_version_id: "scenario",
      scenario_title: "Учебный пожар",
      group_name: "Группа 1",
      role: "operator_112",
      started_at: attempt.started_at,
      ended_at: attempt.ended_at,
      status: completed ? "finished" : "active",
      work_status: completed ? "submitted" : "in_progress",
      card_count: 1,
      completed_count: completed ? 1 : 0,
      score: null,
      max_score: null,
      evaluation_revision: null,
    };
    if (path.startsWith("views/") && path.endsWith("lessons"))
      return route.fulfill({
        json: {
          items: [row],
          total: 1,
          limit: 20,
          offset: 0,
          assigned_count: 0,
          in_progress_count: completed ? 0 : 1,
          submitted_count: completed ? 1 : 0,
          graded_count: 0,
        },
      });
    if (path === "student/lessons/lesson")
      return route.fulfill({
        json: {
          id: "lesson",
          title: "Учебное занятие",
          status: row.status,
          work_status: row.work_status,
          started_at: attempt.started_at,
          ended_at: attempt.ended_at,
          assignments: [
            {
              id: "assignment",
              position: 1,
              title: "Учебная карточка",
              role: "operator_112",
              available: !completed,
              attempt_id: "attempt",
              status: attempt.status,
              card: {
                id: "card",
                started_at: attempt.started_at,
                status: attempt.card.status,
                address_text: attempt.card.data.address_text,
                description: attempt.card.data.description,
                caller_name: attempt.card.data.caller_name,
                caller_phone: attempt.card.data.caller_phone,
                classifier_entry_id: "entry",
                category_name: "Учебный пожар",
              },
            },
          ],
        },
      });
    if (path.endsWith("/evaluation")) return route.fulfill({ json: null });
    if (path.endsWith("/classifier-entries"))
      return route.fulfill({ json: [attempt.classifier_entry] });
    if (path.endsWith("/recipients"))
      return route.fulfill({ json: attempt.recipient_services });
    if (path === "student/attempts/attempt/card" && req.method() === "PUT") {
      const body = req.postDataJSON();
      attempt = {
        ...attempt,
        card: {
          ...attempt.card,
          data: body.data,
          classifier_entry_id: body.classifier_entry_id,
          revision: attempt.card.revision + 1,
        },
      };
      return route.fulfill({ json: attempt });
    }
    if (path === "student/attempts/attempt/submit") {
      attempt = {
        ...attempt,
        status: "completed",
        ended_at: new Date().toISOString(),
        card: { ...attempt.card, status: "notified" },
        notified_services: attempt.recipient_services,
      };
      return route.fulfill({ json: attempt });
    }
    if (path === "student/attempts/attempt")
      return route.fulfill({ json: attempt });
    if (path === "views/admin/dashboard")
      return route.fulfill({ json: { users: 1, services: 1, classifiers: 1 } });
    if (path.startsWith("views/"))
      return route.fulfill({
        json: { items: [], total: 0, limit: 20, offset: 0 },
      });
    return route.fulfill({ status: 404, json: { detail: "Not found" } });
  });
}
