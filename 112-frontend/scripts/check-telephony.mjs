import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
if (!process.env.TELEPHONY_FIXTURE)
  throw new Error("Set TELEPHONY_FIXTURE to a local test fixture JSON");
const data = JSON.parse(await readFile(process.env.TELEPHONY_FIXTURE, "utf8"));
const origin = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:8080";
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: [
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    ...(process.env.TELEPHONY_ALLOW_TEST_HTTP === "1"
      ? [`--unsafely-treat-insecure-origin-as-secure=${origin}`]
      : []),
  ],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1080 } });
page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
page.on("console", (msg) => {
  if (msg.type() === "error") console.log("CONSOLE", msg.text().slice(0, 220));
});
async function login(role) {
  await page.goto(origin + "/login");
  await page.getByLabel("Логин").fill(data.usernames[role]);
  await page.getByLabel("Пароль", { exact: true }).fill(data.password);
  await page.getByLabel("Пароль", { exact: true }).press("Enter");
  await page.waitForURL((url) => !url.pathname.includes("login"));
}
try {
  await login("student");
  await page.goto(origin + `/student/sessions/${data.lesson}`);
  await page.getByRole("button", { name: "Продолжить обработку" }).click();
  await page.getByRole("button", { name: "Подключить гарнитуру" }).click();
  await page.getByRole("button", { name: "Позвонить", exact: true }).waitFor();
  await page.waitForFunction(() =>
    [...document.querySelectorAll("button")].some(
      (b) => b.textContent === "Позвонить" && !b.disabled,
    ),
  );
  await page.waitForTimeout(3000);
  await page.screenshot({
    path: "docs/screenshots/telephony/dds-ready.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Позвонить", exact: true }).click();
  await page
    .locator(".training-telephone__active")
    .filter({ hasText: "Разговор" })
    .waitFor({ timeout: 20000 });
  await page.screenshot({
    path: "docs/screenshots/telephony/dds-call.png",
    fullPage: true,
  });
  await page.waitForTimeout(1500);
  const audio = await page
    .locator(".training-telephone audio")
    .evaluate((el) => ({
      paused: el.paused,
      time: el.currentTime,
      tracks: el.srcObject?.getAudioTracks().length,
    }));
  const sound = await page
    .locator(".training-telephone audio")
    .evaluate(async (el) => {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      ctx.createMediaStreamSource(el.srcObject).connect(analyser);
      const samples = new Float32Array(analyser.fftSize);
      let peak = 0;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 50));
        analyser.getFloatTimeDomainData(samples);
        peak = Math.max(peak, ...samples.map(Math.abs));
      }
      await ctx.close();
      return peak;
    });
  console.log("REMOTE_AUDIO", audio, "PEAK", sound);
  if (sound < 0.01) throw Error("No audible test tone");
  if (audio.paused || !audio.tracks || audio.time <= 0)
    throw Error("Remote media did not start");
  await page.waitForTimeout(6000);
  await page
    .getByRole("button", { name: "Завершить звонок", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Вызвать меня", exact: true })
    .waitFor();
  await page.waitForTimeout(3000);
  await page.getByRole("button", { name: "Вызвать меня", exact: true }).click();
  await page
    .getByText("Входящий учебный звонок", { exact: true })
    .waitFor({ timeout: 20000 });
  await page.screenshot({
    path: "docs/screenshots/telephony/dds-incoming.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Принять", exact: true }).click();
  await page
    .locator(".training-telephone__active")
    .filter({ hasText: "Разговор" })
    .waitFor({ timeout: 20000 });
  await page.waitForTimeout(6000);
  await page
    .getByRole("button", { name: "Завершить звонок", exact: true })
    .click();
  await page.waitForTimeout(2500);
  await page.locator(".training-telephone summary").click();
  await page.screenshot({
    path: "docs/screenshots/telephony/dds-history.png",
    fullPage: true,
  });
  console.log("BROWSER_SIP_OK");
} catch (e) {
  await page.screenshot({
    path: "docs/screenshots/telephony/check-failure.png",
    fullPage: true,
  });
  console.log((await page.locator("body").innerText()).slice(-5000));
  throw e;
} finally {
  await browser.close();
}
