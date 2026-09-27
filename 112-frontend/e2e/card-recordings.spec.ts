import { test, expect } from "./auth-fixture";
import type { Recording } from "../src/entities/recording";

function wav() {
  const data = Buffer.alloc(16044);
  data.write("RIFF");
  data.writeUInt32LE(data.length - 8, 4);
  data.write("WAVEfmt ", 8);
  data.writeUInt32LE(16, 16);
  data.writeUInt16LE(1, 20);
  data.writeUInt16LE(1, 22);
  data.writeUInt32LE(8000, 24);
  data.writeUInt32LE(16000, 28);
  data.writeUInt16LE(2, 32);
  data.writeUInt16LE(16, 34);
  data.write("data", 36);
  data.writeUInt32LE(16000, 40);
  return data;
}
for (const width of [1440, 390]) {
  test(`recordings are authored with the card and listed with usage at ${width}px`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(60000);
    await page.setViewportSize({ width, height: 1000 });
    const recordings: Recording[] = [
      {
        id: "voice1",
        title: "Дым из окна — голос Анны",
        purpose: "caller",
        status: "ready",
        duration_seconds: 21,
        created_at: new Date().toISOString(),
        usages: [],
      },
    ];
    const card = {
      id: "library-card",
      title: "Пожар в жилом доме",
      revision: 1,
      classifier_version_id: "version",
      classifier_entry_id: "entry",
      classifier_label: "Учебный ЕКП",
      classifier_entry: {
        id: "entry",
        code: "101",
        name: "Пожар",
        conditions: {},
      },
      can_edit: true,
      scenario_count: 0,
      caller_message: "Из окна на Лесной, 12 идёт дым.",
      instructions: "",
      audio: {
        caller_ids: ["voice1"],
        crew_variants: [] as {
          greeting_id: string;
          acknowledgment_id: string;
        }[],
      },
      dds_exercise: {
        service_profile_id: "profile",
        crew_calls_required: true,
        initial_crews: [],
        required_crews: [{ crew_code: "fire", status: "assigned" }],
        messages: [
          {
            crew_code: "fire",
            message: "Назначьте расчёт и передайте сообщение руководителю.",
          },
        ],
      },
      data: {
        description: "Дым из окна",
        address_text: "Лесная, 12",
        additional_fields: {},
      },
      recipients: [{ service_id: "service", name: "Служба 101" }],
      recipient_service_ids: ["service"],
    };
    let saved = false;
    await page.route("**/api/v1/**", async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace("/api/v1/", "");
      if (path === "views/cards")
        return route.fulfill({
          json: { items: [card], total: 1, offset: 0, limit: 20 },
        });
      if (path === "cards/library-card") {
        if (route.request().method() === "PUT") {
          card.audio = route.request().postDataJSON().audio;
          saved = true;
        }
        return route.fulfill({ json: card });
      }
      if (path === "telephony/recordings") {
        if (route.request().method() === "POST") {
          expect(
            route.request().postDataBuffer()?.subarray(0, 4).toString(),
          ).toBe("RIFF");
          const recording: Recording = {
            id: `voice${recordings.length + 1}`,
            title: url.searchParams.get("title")!,
            purpose: url.searchParams.get("purpose") as Recording["purpose"],
            status: "ready",
            duration_seconds: 12,
            created_at: new Date().toISOString(),
            usages: [],
          };
          recordings.push(recording);
          return route.fulfill({ status: 201, json: recording });
        }
        const items = recordings
          .filter(
            (r) =>
              !url.searchParams.get("purpose") ||
              r.purpose === url.searchParams.get("purpose"),
          )
          .map((r) => ({
            ...r,
            usages: saved
              ? [
                  { kind: "card", id: card.id, title: card.title },
                  {
                    kind: "scenario",
                    id: "scenario",
                    title: "Пожар — начальная подготовка",
                  },
                ]
              : [],
          }));
        return route.fulfill({ json: { items, total: items.length } });
      }
      if (path.startsWith("telephony/recordings/")) {
        if (path.endsWith("/wav"))
          return route.fulfill({ contentType: "audio/wav", body: wav() });
        return route.fulfill({
          json: recordings.find((r) => path.endsWith(r.id)),
        });
      }
      if (path === "classifiers")
        return route.fulfill({
          json: [{ id: "version", label: "Учебный ЕКП", status: "published" }],
        });
      if (path === "classifiers/version/entries")
        return route.fulfill({ json: [card.classifier_entry] });
      if (path.endsWith("/routes"))
        return route.fulfill({
          json: [
            {
              service_id: "service",
              service_name: "Служба 101",
              conditions: {},
            },
          ],
        });
      if (path.startsWith("service-profiles"))
        return route.fulfill({
          json: {
            id: "profile",
            name: "ДДС службы 101",
            service_id: "service",
            crews: [
              {
                code: "fire",
                name: "Расчёт № 1",
                contact_code: "chief",
                is_active: true,
              },
            ],
          },
        });
      return route.fallback();
    });
    await page.goto("/login");
    await page.getByLabel("Логин").fill("teacher");
    await page.getByLabel("Пароль", { exact: true }).fill("test-password");
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page).not.toHaveURL(/login$/);
    await page.goto("/cards");
    await page.getByRole("button", { name: card.title, exact: true }).click();
    await page
      .getByRole("button", { name: "Редактировать карточку", exact: true })
      .click();
    const jump = (name: string) =>
      page
        .getByRole("navigation", { name: "Разделы карточки" })
        .getByRole("button", { name, exact: true })
        .click();
    await jump("Оператор 112 — условие");
    await page
      .getByLabel("Загрузить: Добавить запись заявителя", { exact: true })
      .setInputFiles({
        name: "Дым из окна — голос Ивана.wav",
        mimeType: "audio/wav",
        buffer: wav(),
      });
    await expect(
      page.getByText("Дым из окна — голос Ивана", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", {
        name: "Прослушать «Дым из окна — голос Ивана»",
        exact: true,
      })
      .click();
    await expect(page.locator("audio")).toBeVisible();
    const browser = testInfo.project.use.browserName ?? "chromium";
    await jump("Оператор 112 — условие");
    await page.screenshot({
      path: `docs/screenshots/card-recordings/${browser}-caller-${width}.png`,
      animations: "disabled",
    });
    await jump("Оператор ДДС — работа бригад");
    await page
      .getByLabel("Загрузить: Приветствие бригады", { exact: true })
      .setInputFiles({
        name: "Иван — приветствие.wav",
        mimeType: "audio/wav",
        buffer: wav(),
      });
    await page
      .getByRole("button", { name: "Сохранить изменения", exact: true })
      .click();
    await expect(
      page
        .getByText("Нажмите «Добавить голос» или очистите выбранные реплики.")
        .first(),
    ).toBeVisible();
    expect(saved).toBe(false);
    await page
      .getByLabel("Загрузить: Подтверждение бригады", { exact: true })
      .setInputFiles({
        name: "Иван — принято.wav",
        mimeType: "audio/wav",
        buffer: wav(),
      });
    await expect(
      page.getByRole("button", { name: "Добавить голос", exact: true }),
    ).toBeEnabled();
    await page
      .getByRole("button", { name: "Добавить голос", exact: true })
      .click();
    await page
      .getByText("Голоса руководителей бригад", { exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `docs/screenshots/card-recordings/${browser}-crew-${width}.png`,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Сохранить изменения", exact: true })
      .click();
    await expect.poll(() => saved).toBe(true);
    expect(card.audio.caller_ids).toHaveLength(2);
    expect(card.audio.crew_variants).toHaveLength(1);
    await page.goto("/teacher/telephony");
    await expect(
      page.getByRole("table", { name: "Библиотека записей" }),
    ).toContainText("Дым из окна — голос Ивана");
    await expect(page.getByRole("table")).toContainText(
      "Карточка: Пожар в жилом доме",
    );
    await expect(page.getByRole("table")).toContainText(
      "Сценарий: Пожар — начальная подготовка",
    );
    await page.screenshot({
      path: `docs/screenshots/card-recordings/${browser}-library-${width}.png`,
      animations: "disabled",
    });
    await page.goto("/cards");
    await page.getByRole("button", { name: card.title, exact: true }).click();
    await jump("Оператор 112 — условие");
    await expect(
      page.getByText("Дым из окна — голос Ивана", { exact: true }),
    ).toBeVisible();
  });
}
