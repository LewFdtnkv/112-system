import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  executablePath:
    "C:\\Users\\fedot\\AppData\\Local\\ms-playwright\\chromium-1243\\chrome-win64\\chrome.exe",
});

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await page.goto("http://127.0.0.1:5173/login");
  await page.waitForTimeout(250);
  await page.screenshot({ path: "tmp/login-verify.png" });
  await page.getByLabel("Электронная почта").fill("student1@example.test");
  await page.getByLabel("Пароль").fill("demo112");
  await page.getByRole("button", { name: "Войти" }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: "tmp/dashboard-verify.png" });
} finally {
  await browser.close();
}
