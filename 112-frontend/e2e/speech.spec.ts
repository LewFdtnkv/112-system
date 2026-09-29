import { test, expect } from "./auth-fixture";
import type { Recording } from "../src/entities/recording";

for (const kind of ["caller", "crew"] as const) {
  test(`teacher synthesizes ${kind}, waits for readiness and attaches recordings`, async ({
    page,
  }) => {
    const recordings: Recording[] = [];
    let saved = 0;
    let finish = false;
    let request: Record<string, string> | undefined;
    const card = {
      id: "card",
      title: "Пожар в доме",
      revision: 1,
      can_edit: true,
      scenario_count: 0,
      classifier_version_id: "version",
      classifier_entry_id: "entry",
      classifier_label: "Учебный ЕКП",
      classifier_entry: {
        id: "entry",
        code: "101",
        name: "Пожар",
        conditions: {},
      },
      caller_message: "На Лесной улице, у дома двенадцать, горит контейнер.",
      instructions: "",
      audio: {
        caller_ids: [] as string[],
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
            message: "Назначьте расчёт и позвоните руководителю.",
          },
        ],
      },
      data: {
        description: "Горит контейнер",
        address_text: "Лесная, 12",
        additional_fields: {},
      },
      recipients: [{ service_id: "service", name: "Служба 101" }],
      recipient_service_ids: ["service"],
    };
    await page.route("**/api/v1/**", async (route) => {
      const path = new URL(route.request().url()).pathname.replace(
        "/api/v1/",
        "",
      );
      if (path === "card-generations")
        return route.fulfill({
          json: { items: [], total: 0, offset: 0, limit: 10 },
        });
      if (path === "views/cards")
        return route.fulfill({
          json: { items: [card], total: 1, offset: 0, limit: 20 },
        });
      if (path === "cards/card") {
        if (route.request().method() === "PUT") {
          saved++;
          card.audio = route.request().postDataJSON().audio;
        }
        return route.fulfill({ json: card });
      }
      if (path === "cards/card/dds-generations")
        return route.fulfill({ json: [] });
      if (path === "telephony/recordings/voices")
        return route.fulfill({
          json: [
            { id: "denis", label: "Денис — мужской голос" },
            { id: "dmitri", label: "Дмитрий — мужской голос" },
          ],
        });
      if (path === "telephony/recordings/synthesize") {
        request = route.request().postDataJSON();
        const parts =
          kind === "caller" ? ["caller"] : ["greeting", "acknowledgment"];
        for (const purpose of parts)
          recordings.push({
            id: purpose,
            title: `${request!.title} · ${purpose === "greeting" ? "приветствие" : purpose === "acknowledgment" ? "подтверждение" : "заявитель"}`,
            purpose: purpose as Recording["purpose"],
            voice: request!.voice,
            text: kind === "caller" ? request!.text : request![purpose],
            status: "queued",
            duration_seconds: null,
            created_at: new Date().toISOString(),
            usages: [],
          });
        return route.fulfill({ status: 202, json: recordings });
      }
      if (path === "telephony/recordings")
        return route.fulfill({
          json: { items: recordings, total: recordings.length },
        });
      if (path.startsWith("telephony/recordings/")) {
        const r = recordings.find((r) => path.endsWith(r.id));
        return route.fulfill({
          json: r && {
            ...r,
            status: finish ? "ready" : "preparing",
            duration_seconds: finish ? 4 : null,
          },
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
    await page.getByLabel("Пароль", { exact: true }).fill("password");
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page).toHaveURL(/teacher$/);
    await page.goto("/cards");
    await page.getByRole("button", { name: card.title, exact: true }).click();
    await page
      .getByRole("button", { name: "Редактировать карточку", exact: true })
      .click();
    await page
      .getByRole("navigation", { name: "Разделы карточки" })
      .getByRole("button", {
        name:
          kind === "caller"
            ? "Оператор 112 — условие"
            : "Оператор ДДС — работа бригад",
        exact: true,
      })
      .click();
    await page
      .getByRole("button", {
        name:
          kind === "caller"
            ? "Озвучить текст заявителя"
            : "Создать голос бригады из текста",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name:
        kind === "caller"
          ? "Озвучка заявителя"
          : "Озвучка руководителя бригады",
      exact: true,
    });
    const title = dialog.getByLabel("Название записи");
    await title.fill("");
    await dialog.getByRole("button", { name: "Озвучить", exact: true }).click();
    await expect(title).toHaveAttribute("aria-invalid", "true");
    expect(request).toBeUndefined();
    await title.fill(
      kind === "caller" ? "Звонок о пожаре" : "Руководитель расчёта",
    );
    await dialog.getByRole("combobox", { name: /Голос/ }).click();
    await page.getByRole("option", { name: "Дмитрий — мужской голос" }).click();
    if (kind === "caller")
      await expect(dialog.getByLabel("Текст заявителя")).toHaveValue(
        card.caller_message,
      );
    else
      await dialog
        .getByLabel("Приветствие")
        .fill("Здравствуйте, бригада на связи. Слушаю вас.");
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({
      path: `docs/screenshots/speech/${kind}-desktop.png`,
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: `docs/screenshots/speech/${kind}-mobile.png`,
      animations: "disabled",
    });
    await dialog.getByRole("button", { name: "Озвучить", exact: true }).click();
    await expect(
      dialog.getByRole("button", { name: "Добавить в карточку", exact: true }),
    ).toBeDisabled();
    expect(saved).toBe(0);
    expect(request?.voice).toBe("dmitri");
    expect(request?.kind).toBe(kind);
    if (kind === "caller") expect(request?.text).toBe(card.caller_message);
    else expect(request?.greeting).toContain("бригада на связи");
    finish = true;
    await expect(
      dialog.getByRole("button", { name: "Добавить в карточку", exact: true }),
    ).toBeEnabled({ timeout: 10000 });
    await page.screenshot({
      path: `docs/screenshots/speech/${kind}-ready.png`,
      animations: "disabled",
    });
    await dialog
      .getByRole("button", { name: "Добавить в карточку", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    await page
      .getByRole("button", { name: "Сохранить изменения", exact: true })
      .click();
    await expect.poll(() => saved).toBe(1);
    if (kind === "caller") expect(card.audio.caller_ids).toEqual(["caller"]);
    else
      expect(card.audio.crew_variants).toEqual([
        { greeting_id: "greeting", acknowledgment_id: "acknowledgment" },
      ]);
  });
}
